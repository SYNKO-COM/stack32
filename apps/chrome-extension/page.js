// This entire function is packaged code, executed in the ISOLATED world.
// No strings are interpreted as JS, no page-provided instructions are executed.
export function pageOperation(
  origin,
  action,
  expectedPreview = null,
  execute = false,
) {
  if (
    location.hostname.endsWith(".stack32.com") &&
    location.pathname !== "/browser/test"
  )
    throw Error("TEST_PAGE_ONLY");
  if (location.origin !== origin || window !== window.top)
    throw Error("SITE_CHANGED");
  const sensitive =
    /password|passwd|secret|token|api.?key|credit.?card|card.?number|cvv|cvc|captcha|one.?time|otp|2fa|authentication/i;
  if (
    !["read", "fill", "click"].includes(action.kind) ||
    typeof action.selector !== "string" ||
    action.selector.length > 240 ||
    /^(\*|body|html|:root)$/i.test(action.selector.trim())
  )
    throw Error("INVALID_ACTION");
  const elements = document.querySelectorAll(action.selector);
  if (elements.length !== 1) throw Error("CHOOSE_ONE_ELEMENT");
  const element = elements[0];
  if (element === document.body || element === document.documentElement)
    throw Error("SELECT_RELEVANT_REGION");
  const visible = (e) =>
    e.getClientRects().length > 0 &&
    getComputedStyle(e).visibility === "visible" &&
    getComputedStyle(e).display !== "none";
  if (!visible(element) || element.closest('[hidden],[aria-hidden="true"]'))
    throw Error("NOT_VISIBLE");
  if (
    sensitive.test(
      [
        element.id,
        element.getAttribute("name"),
        element.getAttribute("autocomplete"),
        element.getAttribute("type"),
        element.getAttribute("aria-label"),
      ].join(" "),
    )
  )
    throw Error("SENSITIVE_FIELD");
  if (
    document.querySelector(
      'input[type="password"],iframe[src*="captcha"],iframe[src*="recaptcha"],input[autocomplete="one-time-code"]',
    )
  )
    throw Error("MANUAL_AUTHENTICATION_REQUIRED");
  if (action.kind === "read") {
    // Read relevant visible text, or one explicitly selected safe text field.
    if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement
    ) {
      if (
        element instanceof HTMLInputElement &&
        !["text", "email", "search", "url", "tel"].includes(element.type)
      )
        throw Error("SENSITIVE_FIELD");
      return { status: "read", text: element.value.slice(0, 2000) };
    }
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let text = "",
      n,
      visited = 0;
    while ((n = walker.nextNode()) && text.length < 2000 && visited++ < 2000) {
      const parent = n.parentElement;
      if (
        parent &&
        visible(parent) &&
        !parent.closest(
          'script,style,noscript,input,textarea,select,[contenteditable],[hidden],[aria-hidden="true"],[data-sensitive]',
        ) &&
        !sensitive.test(
          [
            parent.id,
            parent.getAttribute("name"),
            parent.getAttribute("aria-label"),
          ].join(" "),
        )
      )
        text += n.textContent + " ";
    }
    const controls = [];
    for (const field of element.querySelectorAll(
      "input,textarea,select,button,a",
    )) {
      if (controls.length >= 12) break;
      if (
        !visible(field) ||
        sensitive.test(
          [
            field.id,
            field.name,
            field.type,
            field.autocomplete,
            field.getAttribute("aria-label"),
          ].join(" "),
        )
      )
        continue;
      let selector = field.id ? "#" + CSS.escape(field.id) : "";
      if (!selector && field.name)
        selector =
          field.tagName.toLowerCase() +
          '[name="' +
          CSS.escape(field.name) +
          '"]';
      if (!selector || document.querySelectorAll(selector).length !== 1)
        continue;
      const label =
        field.labels?.[0]?.textContent ||
        field.getAttribute("aria-label") ||
        field.textContent ||
        field.name;
      controls.push({
        selector,
        label: String(label || "").slice(0, 100),
        kind: field.tagName.toLowerCase(),
      });
    }
    while (JSON.stringify({ text, controls }).length > 4000 && controls.length)
      controls.pop();
    return {
      status: "read",
      text: JSON.stringify({ text: text.slice(0, 2000), controls }),
    };
  }
  const fields = [];
  let target = "";
  let submission = null;
  if (action.kind === "fill") {
    if (
      !(
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement
      ) ||
      element.disabled ||
      element.readOnly ||
      (element instanceof HTMLInputElement &&
        !["text", "email", "search", "url", "tel"].includes(element.type))
    )
      throw Error("UNSUPPORTED_FIELD");
    if (typeof action.value !== "string" || action.value.length > 2000)
      throw Error("INVALID_VALUE");
    target =
      element.getAttribute("aria-label") ||
      element.labels?.[0]?.textContent ||
      element.name ||
      element.id;
    if (!target) throw Error("UNLABELED_FIELD");
    fields.push({ field: target, value: action.value });
  } else if (element instanceof HTMLAnchorElement) {
    if (
      new URL(element.href).origin !== origin ||
      element.download ||
      element.target === "_blank"
    )
      throw Error("SITE_CHANGE_BLOCKED");
    target = element.href;
  } else {
    // Generic dynamic buttons may hide recipients/payment/publication payloads.
    // Only an inspectable native form can be proposed in this first version.
    if (
      !(
        element instanceof HTMLButtonElement ||
        element instanceof HTMLInputElement
      ) ||
      element.type !== "submit" ||
      !element.form ||
      element.disabled
    )
      throw Error("MANUAL_ACTION_REQUIRED");
    const form = element.form;
    const destination = element.hasAttribute("formaction")
      ? element.formAction
      : form.action || location.href;
    if (new URL(destination).origin !== origin)
      throw Error("SITE_CHANGE_BLOCKED");
    submission = {
      destination,
      method: element.hasAttribute("formmethod")
        ? element.formMethod
        : form.method,
      submitter: { name: element.name, value: element.value },
    };
    for (const field of form.elements) {
      if (
        !(
          field instanceof HTMLInputElement ||
          field instanceof HTMLTextAreaElement ||
          field instanceof HTMLSelectElement
        )
      )
        continue;
      if (field.disabled || ["submit", "button", "reset"].includes(field.type))
        continue;
      if (
        !visible(field) ||
        sensitive.test(
          [field.name, field.id, field.type, field.autocomplete].join(" "),
        )
      )
        throw Error("MANUAL_ACTION_REQUIRED");
      if (["checkbox", "radio"].includes(field.type) && !field.checked)
        continue;
      if (
        field.type === "file" ||
        (field instanceof HTMLSelectElement && field.multiple)
      )
        throw Error("MANUAL_ACTION_REQUIRED");
      const label =
        field.labels?.[0]?.textContent ||
        field.getAttribute("aria-label") ||
        field.name;
      if (!label || field.value.length > 2000 || fields.length >= 15)
        throw Error("MANUAL_ACTION_REQUIRED");
      fields.push({ field: label, value: field.value });
    }
    if (form.querySelector("[contenteditable]") || fields.length === 0)
      throw Error("MANUAL_ACTION_REQUIRED");
    target = element.textContent || element.value || "Submit";
  }
  const preview = JSON.stringify(
    { origin, action: action.kind, target, fields, submission },
    null,
    2,
  );
  if (!execute) return { preview };
  if (preview !== expectedPreview) throw Error("PAGE_CHANGED_REVIEW_AGAIN");
  const rect = element.getBoundingClientRect();
  const top = document.elementFromPoint(
    rect.x + rect.width / 2,
    rect.y + rect.height / 2,
  );
  if (top !== element && !element.contains(top)) throw Error("TARGET_OBSCURED");
  if (action.kind === "fill") {
    const proto =
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(
      element,
      action.value,
    );
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  } else if (element instanceof HTMLAnchorElement) {
    // Navigate to the reviewed URL without invoking an opaque page click handler.
    location.assign(element.href);
  } else element.click();
  return {
    status: "interacted",
    text: "Interaction dispatched. Read the outcome before claiming success.",
  };
}
