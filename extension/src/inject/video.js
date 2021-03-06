const inIframe = self !== top;
const inPopup = window.opener !== null && window.opener !== window;

const jitsipop = (window.jitsipop = inPopup
  ? window.opener.jitsipop
  : window.parent.jitsipop);

const mainWindow = jitsipop.mainWindow;

var sourceVid,
  targetVid,
  displayName,
  participantId,
  videoId,
  enableMappertje,
  myMapper;

const handleFirstPlay = () => {
  targetVid.removeEventListener("play", handleFirstPlay);
  const frameElement = window.frameElement;
  frameElement && frameElement.classList.add("firstplay");
};

// TODO: currently can't call iframe.contentWindow.setup(config);
// inside mappertje (in modules/mapper/index.js) because main.js
// is added via a script tag, and executes in a JavaScript page context,
// not in the context of this extension...

const syncSource = () => {
  if (enableMappertje)
    if (myMapper) {
      if (
        myMapper &&
        myMapper.getStream &&
        myMapper.getStream() !== sourceVid.srcObject
      ) {
        myMapper.setStream(sourceVid.srcObject);
      }
    } else {
      jitsipop.mapper({
        stream: sourceVid.srcObject,
        targetElement: document.body,
        initialState: jitsipop.getMappertjeState(videoId),
        readyHandler: (newMapper) => {
          myMapper = newMapper;

          const unloadHandler = () => {
            jitsipop.setMappertjeState(videoId, myMapper.getCurrentState());
          };

          myMapper.addEventListener("unload", unloadHandler);
        },
      });
    }
  else if (targetVid.srcObject !== sourceVid.srcObject) {
    targetVid.srcObject = sourceVid.srcObject;
  }
};

const syncVideo = () => {
  try {
    if (inPopup && (!mainWindow || mainWindow.closed)) {
      window.close();
    }
  } catch (e) {
    // In case it's a left over window and we can't access mainWindow
    window.close();
  }

  const newVid = jitsipop.getParticipantVideo(participantId);
  if (!newVid) {
    return;
  }

  if (sourceVid !== newVid) {
    if (sourceVid) {
      sourceVid.removeEventListener("loadedmetadata", syncSource);
      sourceVid.removeEventListener("pause", syncVideo);
      sourceVid.removeEventListener("ended", syncVideo);
      sourceVid.removeEventListener("suspend", syncVideo);
    }

    sourceVid = newVid;
    sourceVid.addEventListener("loadedmetadata", syncSource);
    sourceVid.addEventListener("pause", syncVideo);
    sourceVid.addEventListener("ended", syncVideo);
    sourceVid.addEventListener("suspend", syncVideo);
  }

  // Could have been in the if block above,
  // but I'd like to sync each time just to be sure
  syncSource();
};

const setTitle = () => {
  document.title =
    "Jitsi Meet | " + displayName + (enableMappertje ? " | Mappertje" : "");
};

const displayNameChangeHandler = (newDisplayName) => {
  displayName = newDisplayName;
  setTitle();
};

const participantIdReplaceHandler = (newParticipantId) => {
  participantId = newParticipantId;
  update();
};

const update = () => {
  participantId = jitsipop.getParticipantId(videoId);
  displayName = jitsipop.getFormattedDisplayName(participantId);
  setTitle();
  syncVideo();
};

const hashToUrlParams = (hash) => {
  return new URLSearchParams("?" + hash.substring(2).replace(/\//g, "&"));
};

const setup = () => {
  // Allow calling these functions from mainWindow
  window.displayNameChangeHandler = displayNameChangeHandler;
  window.participantIdReplaceHandler = participantIdReplaceHandler;

  const urlParams = hashToUrlParams(location.hash);
  videoId = urlParams.get("id");

  if (videoId === null) {
    return;
  }

  enableMappertje = urlParams.get("mappertje") === "true";
  videoId = parseInt(videoId);

  window.onunload = () => {
    // Remove this window from the array of open pop-outs in the main window
    if (mainWindow && !mainWindow.closed) {
      jitsipop.addOrDeleteVideo(
        videoId,
        window,
        inIframe ? "iframe" : "window",
        "delete"
      );
    }
  };

  if (!enableMappertje) {
    targetVid = document.createElement("video");
    targetVid.muted = true;
    targetVid.autoplay = true;

    if (inIframe) {
      document.documentElement.classList.add("iframe");
      targetVid.addEventListener("play", handleFirstPlay);
    }

    document.body.appendChild(targetVid);
  }

  update();

  // Keep source and target in sync
  setInterval(syncVideo, 1000);

  if (inPopup) {
    if (mainWindow && !mainWindow.closed) {
      jitsipop.addOrDeleteVideo(videoId, window, "window", "add");
    }

    tryRuntimeSendMessage({
      type: "videoWinLoad",
    });

    document.documentElement.addEventListener("keyup", (event) => {
      // Number 13 is the "Enter" key on the keyboard,
      // or "Escape" key pressed in full screen
      if (
        event.keyCode === 13 ||
        (event.keyCode === 27 && window.innerHeight == window.screen.height)
      ) {
        // Cancel the default action, if needed
        event.preventDefault();
        tryRuntimeSendMessage({
          type: "toggleFullScreen",
        });
      }
    });
  } else if (inIframe) {
    if (mainWindow && !mainWindow.closed) {
      jitsipop.addOrDeleteVideo(videoId, window, "iframe", "add");
    }
  }
};

if (inIframe || inPopup) {
  setup();
}
