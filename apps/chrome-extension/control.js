import { pageOperation } from "./page.js";
const API =
  "https://stack32-agent-api-preprod-spxecrm6bq-ew.a.run.app/v1/browser";
const params = new URLSearchParams(location.search);
const tabId = Number(params.get("tab")),
  origin = params.get("origin");
const el = (id) => document.getElementById(id);
let token = null,
  command = null,
  preview = null,
  previewDocument = null,
  stopped = false,
  polling = false,
  lang = navigator.language.startsWith("fr") ? "fr" : "en";
const copy = {
  fr: {
    intro:
      "Autorisez uniquement cet onglet pour votre tâche. Gardez cette fenêtre et la page Stack32 de connexion ouvertes (15 minutes maximum).",
    codeLabel: "Code d’appairage de votre compte Stack32",
    connect: "Relier mon compte et autoriser cet onglet",
    reviewTitle: "Confirmer cette action",
    reviewWarning:
      "Vérifiez les destinataires, le contenu exact et les conséquences. Refusez si ces informations sont incomplètes. Certaines actions sont irréversibles.",
    approve: "Confirmer cette action exacte",
    deny: "Refuser",
    stop: "Arrêter",
    revoke: "Retirer l’accès",
    ready:
      "Connecté. Revenez à la conversation et demandez à l’agent de continuer.",
    stopped: "Accès arrêté. Aucune nouvelle action ne sera exécutée.",
    failed:
      "Action interrompue : aucune réussite confirmée. Reconnectez-vous ou effectuez la tâche manuellement.",
  },
  en: {
    intro:
      "Authorize only this tab for your task. Keep this window and the Stack32 connection page open (15 minutes maximum).",
    codeLabel: "Pairing code from your Stack32 account",
    connect: "Link my account and authorize this tab",
    reviewTitle: "Confirm this action",
    reviewWarning:
      "Check recipients, exact content and consequences. Deny if these details are incomplete. Some actions cannot be undone.",
    approve: "Confirm this exact action",
    deny: "Deny",
    stop: "Stop",
    revoke: "Revoke access",
    ready:
      "Connected. Return to the conversation and ask the agent to continue.",
    stopped: "Access stopped. No new action will run.",
    failed:
      "Action interrupted: no successful outcome confirmed. Reconnect or complete the task manually.",
  },
};
function translate() {
  document.documentElement.lang = lang;
  for (const id of [
    "intro",
    "codeLabel",
    "connect",
    "reviewTitle",
    "reviewWarning",
    "approve",
    "deny",
    "stop",
    "revoke",
  ])
    el(id).textContent = copy[lang][id];
}
translate();
el("site").textContent = origin;
el("language").onclick = () => {
  lang = lang === "fr" ? "en" : "fr";
  translate();
};
async function api(path, body, method = "POST") {
  const response = await fetch(API + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
    redirect: "error",
  });
  if (!response.ok) throw Error("ACCESS_STOPPED");
  return response.json();
}
async function checkTab() {
  const tab = await chrome.tabs.get(tabId);
  if (stopped || new URL(tab.url).origin !== origin)
    throw Error("SITE_CHANGED");
}
async function operate(action, expected = null, execute = false) {
  await checkTab();
  const result = await chrome.scripting.executeScript({
    target: execute
      ? { tabId, documentIds: [previewDocument] }
      : { tabId, frameIds: [0] },
    world: "ISOLATED",
    func: pageOperation,
    args: [origin, action, expected, execute],
  });
  if (!execute && action.kind !== "read")
    previewDocument = result[0]?.documentId;
  if (stopped || !result[0]?.result) throw Error("ACTION_FAILED");
  return result[0].result;
}
async function finish(result) {
  const pending = command;
  command = null;
  preview = null;
  el("command").hidden = true;
  await api(`/device/commands/${pending.id}/result`, result);
}
async function stop() {
  stopped = true;
  command = null;
  el("command").hidden = true;
  el("status").textContent = copy[lang].stopped;
  const old = token;
  token = null;
  if (old)
    await fetch(API + "/device", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${old}` },
      keepalive: true,
    }).catch(() => {});
  el("pair").hidden = false;
}
el("connect").onclick = async () => {
  el("connect").disabled = true;
  try {
    stopped = false;
    await checkTab();
    const paired = await api("/pair", {
      code: el("code").value.trim(),
      origin,
    });
    token = paired.token;
    el("code").value = "";
    el("pair").hidden = true;
    el("agent").textContent = paired.agent_name;
    el("expires").textContent = new Date(
      paired.expires_at,
    ).toLocaleTimeString();
    el("status").textContent = copy[lang].ready;
    await poll();
  } catch {
    await stop();
    el("status").textContent = copy[lang].failed;
  } finally {
    el("connect").disabled = false;
  }
};
async function poll() {
  if (!token || stopped || polling) return;
  polling = true;
  try {
    await checkTab();
    const response = await api("/device/poll");
    if (response.origin !== origin) throw Error("SITE_CHANGED");
    if (command && Date.now() > Date.parse(command.expires_at)) {
      command = null;
      el("command").hidden = true;
    }
    if (!command && response.commands.length) {
      command = response.commands[0];
      await api(`/device/commands/${command.id}/validate`);
      if (command.action.kind === "read") {
        await finish(await operate(command.action));
      } else {
        const result = await operate(command.action);
        preview = result.preview;
        el("purpose").textContent = command.action.purpose;
        el("preview").textContent = preview;
        el("command").hidden = false;
      }
    }
  } catch {
    if (command) {
      try {
        await finish({
          status: "failed",
          text: "Action stopped; no success confirmed.",
        });
      } catch {
        /* no retry */
      }
    }
    await stop();
    el("status").textContent = copy[lang].failed;
  } finally {
    polling = false;
  }
}
el("approve").onclick = async () => {
  if (!command || stopped) return;
  el("approve").disabled = true;
  try {
    const current = command;
    await api(`/device/commands/${current.id}/validate`);
    if (command !== current || stopped) throw Error("STOPPED");
    await finish(await operate(current.action, preview, true));
  } catch {
    if (command) {
      try {
        await finish({
          status: "failed",
          text: "Page changed or action interrupted. Outcome unconfirmed.",
        });
      } catch {
        /* no retry */
      }
    }
    await stop();
    el("status").textContent = copy[lang].failed;
  } finally {
    el("approve").disabled = false;
  }
};
el("deny").onclick = async () => {
  try {
    if (command)
      await finish({
        status: "denied",
        text: "The user denied this exact action. Stop this task.",
      });
  } finally {
    await stop();
  }
};
el("stop").onclick = stop;
el("revoke").onclick = stop;
chrome.tabs.onRemoved.addListener((id) => {
  if (id === tabId) void stop();
});
chrome.tabs.onUpdated.addListener((id, change) => {
  if (id === tabId && change.url && new URL(change.url).origin !== origin)
    void stop();
});
window.addEventListener("pagehide", () => {
  void stop();
});
setInterval(poll, 2000);
