chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "fetchImagePage") {
    fetch(message.url)
      .then(response => {
        if (!response.ok) throw new Error("Network response was not ok");
        return response.text();
      })
      .then(html => {
        sendResponse({ html });
      })
      .catch(err => {
        console.error("Fetch failed:", err);
        sendResponse({ error: err.message });
      });

    return true; // keep async alive
  }

  if (message.type === "downloadImage" && message.url) {
    chrome.downloads.download({
      url: message.url,
      saveAs: false // avoid Save As dialog
    });

    // No need to return true here unless you're planning to send a response
  }
});
