// Constants
const POST_CONTAINER_SELECTOR = ".postContainer.opContainer, .postContainer.replyContainer";
const FILE_THUMB_SELECTOR = "a.fileThumb";
const IMAGE_VIEW_ID = "imageView";
const BASE_DIV_ID = "base";
const IMAGE_POST_CLASS = "imagePost";
const IMAGE_POST_ID_PREFIX = "imagePost";
const ACTIVE_STATE_KEY = "active";
const BUTTON_BAR_ID = "buttonBar";
const VALID_MEDIA_REGEX = /\.(jpg|jpeg|png|gif|webp|webm|mp4)$/i;

const R_KEY = 82;
const ESCAPE_KEY = 27;
const W_KEY = 87;
const S_KEY = 83;
const D_KEY = 68;

const scopedMediaCache = new Map();
const urlHistoryQueue = [];
const MAX_HISTORY_SIZE = 10;
// Retrieve last volume from localStorage, default to 1.0
let lastVideoVolume = parseFloat(localStorage.getItem("lastVideoVolume") || "1.0");


let imageElements = [];
let currentIndex = 0;
let displayEnabled = false;

// Cache logic
function getCurrentUrl() {
    return window.location.href;
}

function updateScopedCache() {
    const currentUrl = getCurrentUrl();
    if (!scopedMediaCache.has(currentUrl)) {
        if (urlHistoryQueue.length >= MAX_HISTORY_SIZE) {
            const oldestUrl = urlHistoryQueue.shift();
            scopedMediaCache.delete(oldestUrl);
            localStorage.removeItem(oldestUrl);
        }
        urlHistoryQueue.push(currentUrl);
        scopedMediaCache.set(currentUrl, new Map());
    }
}

function cacheMediaElement(href, el) {
    const currentUrl = getCurrentUrl();
    const innerMap = scopedMediaCache.get(currentUrl);
    if (innerMap) {
        innerMap.set(href, el);
    }
}

function getCachedMediaElement(href) {
    const currentUrl = getCurrentUrl();
    const innerMap = scopedMediaCache.get(currentUrl);
    return innerMap ? innerMap.get(href) : null;
}
// Cache logic end

function updateDisplayState() {
    const activeState = localStorage.getItem(ACTIVE_STATE_KEY);
    displayEnabled = activeState === "true";

    if (displayEnabled) {
        console.log("Activating image and buttons");
        setupDisplayElements();
        document.getElementById(IMAGE_VIEW_ID).style.display = "block";

        if (imageElements.length > 0 && currentIndex >= 0) {
            showImage(currentIndex);
        }
    } else {
        console.log("Hiding image and buttons");

        document.querySelectorAll(`#${BUTTON_BAR_ID}, #directionalControls, img.controlButton`).forEach(el => el.remove());
        const imageView = document.getElementById(IMAGE_VIEW_ID);
        imageView.style.display = "none";
        imageView.innerHTML = "";
    }
}



window.addEventListener("load", async () => {
    updateScopedCache();
    imageElements = Array.from(document.querySelectorAll(POST_CONTAINER_SELECTOR))
        .map(post => post.querySelector(FILE_THUMB_SELECTOR))
        .filter(a => a?.href && VALID_MEDIA_REGEX.test(a.href));

    if (imageElements.length === 0) return;

    setupDisplayElements();

    const activeState = localStorage.getItem(ACTIVE_STATE_KEY);
    if (activeState === "true") {
        displayEnabled = true;
        showImage(currentIndex);
    }
});

function setupDisplayElements() {
    // Create base container
    const baseDiv = document.createElement("div");
    baseDiv.id = BASE_DIV_ID;
    document.body.appendChild(baseDiv);

    // Create image view
    const imageView = document.createElement("div");
    imageView.className = IMAGE_VIEW_ID;
    imageView.id = IMAGE_VIEW_ID;
    document.body.appendChild(imageView);


    // Create button bar container
    const buttonBar = document.createElement("div");
    buttonBar.id = BUTTON_BAR_ID;
    buttonBar.style.cssText = `
    position: fixed;
    bottom: 10px;
    left: 10px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    z-index: 9999;
`;

    // ESC button setup — solo top element
    const escButton = document.createElement("img");
    escButton.src = chrome.runtime.getURL("assets/esc.png");
    escButton.className = "controlButton";
    escButton.style.cssText = `
    margin: 2px 0 4px 0;
    align-self: flex-start;
`;
    escButton.title = "Toggle Image Viewer";
    escButton.addEventListener("click", () => {
        console.log("ESC button clicked – delegating to triggerKey()");
        triggerKey(ESCAPE_KEY);
    });

    // Directional control row
    const topRow = document.createElement("div");
    topRow.id = "directionalControls";
    topRow.style.cssText = `
    display: flex;
    flex-direction: row;
    justify-content: flex-start;
    gap: 2px;
`;

    const controlButtons = [
        { keyCode: W_KEY, image: "assets/w.png" },
        { keyCode: S_KEY, image: "assets/s.png" },
        { keyCode: D_KEY, image: "assets/d.png" },
        { keyCode: R_KEY, image: "assets/r.png" }
    ];

    controlButtons.forEach(({ keyCode, image }) => {
        const img = document.createElement("img");
        img.src = chrome.runtime.getURL(image);
        img.className = "controlButton";
        img.style.margin = "2px";
        img.addEventListener("click", () => triggerKey(keyCode));
        topRow.appendChild(img);
    });

    // Assemble bar
    buttonBar.appendChild(escButton);     // Top
    buttonBar.appendChild(topRow);        // Bottom
    document.body.appendChild(buttonBar);

    // Prevent blocking clicks behind overlays
    imageView.style.pointerEvents = "none";
    buttonBar.style.pointerEvents = "none";


}

function showImage(index) {
    if (!displayEnabled || index < 0 || index >= imageElements.length) return;
    currentIndex = index;

    const anchor = imageElements[index];
    anchor.scrollIntoView({ behavior: "smooth", block: "center" });

    const fullSrc = anchor.href.startsWith("//") ? "https:" + anchor.href : anchor.href;
    if (!fullSrc) return;

    const cached = getCachedMediaElement(fullSrc);
    const imageView = document.getElementById(IMAGE_VIEW_ID);
    const buttonBar = document.getElementById(BUTTON_BAR_ID);

    imageView.innerHTML = "";
    buttonBar.style.display = "flex";

    let mediaEl = cached;
    if (!mediaEl) {
        const ext = fullSrc.split(".").pop().toLowerCase();
        const isVideo = ext === "mp4" || ext === "webm";

        mediaEl = isVideo
            ? Object.assign(document.createElement("video"), {
                src: fullSrc,
                controls: true,
                muted: false,
                autoplay: true,
                playsInline: true,
                volume: lastVideoVolume, // ✅ apply persisted volume
                style: "pointer-events: auto;"
            })
            : Object.assign(document.createElement("img"), {
                src: fullSrc,
                style: "pointer-events: auto;"
            });

        cacheMediaElement(fullSrc, mediaEl);
        mediaEl.className = IMAGE_POST_CLASS;
        mediaEl.id = `${IMAGE_POST_ID_PREFIX}${index}`;
    }

    // ✅ Always apply and listen, even if cached
    if (mediaEl.tagName === "VIDEO") {
        mediaEl.volume = lastVideoVolume;

        mediaEl.addEventListener("volumechange", () => {
            lastVideoVolume = mediaEl.volume;
            localStorage.setItem("lastVideoVolume", lastVideoVolume.toString());
        });
    }

    imageView.appendChild(mediaEl);
    imageView.style.display = "block";
}



function toggleActive() {
    displayEnabled = !displayEnabled;
    localStorage.setItem(ACTIVE_STATE_KEY, displayEnabled ? "true" : "false");
}

function triggerKey(keyCode) {
    document.dispatchEvent(new KeyboardEvent("keydown", { keyCode }));
}

document.addEventListener("keydown", async (e) => {
    updateScopedCache();
    switch (e.keyCode) {
        case ESCAPE_KEY:
            console.log("ESC key pressed");
            toggleActive();
            console.log("Toggled active state:", displayEnabled);
            updateDisplayState();
            break;
        case W_KEY:
            if (!displayEnabled) return;
            currentIndex++;
            if (currentIndex >= imageElements.length) return;
            showImage(currentIndex);
            break;
        case S_KEY:
            if (!displayEnabled) return;
            currentIndex--;
            if (currentIndex < 0) return;
            showImage(currentIndex);
            break;
        case D_KEY:
            if (!displayEnabled) return;
            const imgEl = document.getElementById(`${IMAGE_POST_ID_PREFIX}${currentIndex}`);
            if (!imgEl?.src) return;
            chrome.runtime.sendMessage({
                type: "downloadImage",
                url: imgEl.src
            });
            break;
        case R_KEY:
            if (!displayEnabled) return;
            location.reload();
            break;
    }
});

// Save current index before unload
window.addEventListener("beforeunload", () => {
    localStorage.setItem("lastViewedIndex", currentIndex);
});

// Restore index after load if active
window.addEventListener("load", async () => {
    updateScopedCache();
    imageElements = Array.from(document.querySelectorAll(POST_CONTAINER_SELECTOR))
        .map(post => post.querySelector(FILE_THUMB_SELECTOR))
        .filter(a => a?.href && VALID_MEDIA_REGEX.test(a.href));

    if (imageElements.length === 0) return;

    setupDisplayElements();

    const activeState = localStorage.getItem(ACTIVE_STATE_KEY);
    if (activeState === "true") {
        displayEnabled = true;
        const savedIndex = parseInt(localStorage.getItem("lastViewedIndex") || "0");
        currentIndex = Math.min(savedIndex, imageElements.length - 1);
        showImage(currentIndex);
    }
});
