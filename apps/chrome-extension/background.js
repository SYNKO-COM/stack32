// A user click grants activeTab; no all-sites access or background browsing.
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url?.startsWith("https://")) return;
  await chrome.windows.create({
    url: chrome.runtime.getURL(
      `control.html?tab=${tab.id}&origin=${encodeURIComponent(new URL(tab.url).origin)}`,
    ),
    type: "popup",
    width: 500,
    height: 740,
  });
});
