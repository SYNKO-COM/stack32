// Deletes the authenticated caller's account after reclaiming published agents
// to the platform (@stack32). Invoked from the web app Settings dialog.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type PrepareResult = {
  platformUserId?: string;
  transferredAgentIds?: string[];
  transferredCount?: number;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: "server_misconfigured" }, 500);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "not_authenticated" }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();

  if (userError || !user) {
    return json({ error: "not_authenticated" }, 401);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1) Reclaim published agents → @stack32 (atomic SQL).
  const { data: prepareData, error: prepareError } = await admin.rpc(
    "prepare_account_deletion",
    { p_user_id: user.id },
  );

  if (prepareError) {
    console.error("[delete-account] prepare failed", prepareError);
    return json(
      { error: "prepare_failed", detail: prepareError.message },
      500,
    );
  }

  const prepared = (prepareData ?? {}) as PrepareResult;
  const platformUserId = prepared.platformUserId;
  const transferredAgentIds = prepared.transferredAgentIds ?? [];

  // 2) Move storage for transferred agents, then wipe the rest of the user tree.
  try {
    if (platformUserId && transferredAgentIds.length > 0) {
      for (const agentId of transferredAgentIds) {
        await moveStoragePrefix(
          admin,
          "agent-knowledge",
          `${user.id}/${agentId}`,
          `${platformUserId}/${agentId}`,
        );
        await moveStoragePrefix(
          admin,
          "attachments",
          `${user.id}/${agentId}`,
          `${platformUserId}/${agentId}`,
        );
      }
    }

    await emptyStoragePrefix(admin, "avatars", user.id);
    await emptyStoragePrefix(admin, "agent-knowledge", user.id);
    await emptyStoragePrefix(admin, "attachments", user.id);
  } catch (storageError) {
    console.error("[delete-account] storage cleanup failed", storageError);
    // Continue — auth delete + DB cascade is the source of truth.
  }

  // 3) Hard-delete auth user → cascades remaining personal rows.
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    console.error("[delete-account] auth delete failed", deleteError);
    return json(
      { error: "delete_failed", detail: deleteError.message },
      500,
    );
  }

  return json({
    ok: true,
    transferredCount: prepared.transferredCount ?? transferredAgentIds.length,
  });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function listAllFiles(
  admin: ReturnType<typeof createClient>,
  bucket: string,
  prefix: string,
): Promise<string[]> {
  const paths: string[] = [];
  const queue: string[] = [prefix];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const { data, error } = await admin.storage.from(bucket).list(current, {
      limit: 1000,
    });
    if (error || !data) continue;

    for (const entry of data) {
      const fullPath = current ? `${current}/${entry.name}` : entry.name;
      // Supabase list: folders typically have a null `id`.
      if (entry.id == null) {
        queue.push(fullPath);
      } else {
        paths.push(fullPath);
      }
    }
  }

  return paths;
}

async function emptyStoragePrefix(
  admin: ReturnType<typeof createClient>,
  bucket: string,
  prefix: string,
): Promise<void> {
  const paths = await listAllFiles(admin, bucket, prefix);
  for (let i = 0; i < paths.length; i += 100) {
    const chunk = paths.slice(i, i + 100);
    if (chunk.length === 0) continue;
    const { error } = await admin.storage.from(bucket).remove(chunk);
    if (error) {
      console.error(`[delete-account] remove ${bucket}/${prefix}`, error);
    }
  }
}

async function moveStoragePrefix(
  admin: ReturnType<typeof createClient>,
  bucket: string,
  fromPrefix: string,
  toPrefix: string,
): Promise<void> {
  const paths = await listAllFiles(admin, bucket, fromPrefix);
  for (const path of paths) {
    if (!path.startsWith(fromPrefix)) continue;
    const dest = `${toPrefix}${path.slice(fromPrefix.length)}`;
    const { error } = await admin.storage.from(bucket).move(path, dest);
    if (error) {
      console.error(`[delete-account] move ${bucket}/${path} → ${dest}`, error);
    }
  }
}
