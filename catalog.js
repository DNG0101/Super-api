(() => {
  const g = globalThis;
  const n = navigator;
  const d = document;
  const path = (s) => {
    try {
      let o = g;
      for (const k of s.split('.')) { if (o == null || !(k in o)) return false; o = o[k]; }
      return o !== undefined && o !== null;
    } catch { return false; }
  };
  const proto = (c, k) => { try { return !!g[c]?.prototype && k in g[c].prototype; } catch { return false; } };
  const any = (...xs) => xs.some(x => typeof x === 'function' ? !!x() : path(x));
  const A = (name, category, test, action = null, note = '') => ({ name, category, test: typeof test === 'function' ? test : () => path(test), action, note });

  window.WEB_API_CATALOG = [
    A('Attribution Reporting API','Privacy & ads',()=>proto('HTMLAnchorElement','attributionSrc')||proto('XMLHttpRequest','setAttributionReporting'),'attribution-info','Browser/privacy feature'),
    A('Audio Output Devices API','Media & audio',()=>!!n.mediaDevices?.selectAudioOutput||proto('HTMLMediaElement','setSinkId'),'audio-output','Output-device picker where supported'),
    A('Audio Session API','Media & audio',()=>path('navigator.audioSession')||path('AudioSession'),'audio-session'),

    A('Background Fetch API','Background & PWA',()=>proto('ServiceWorkerRegistration','backgroundFetch'),null,'Service worker + browser support required'),
    A('Background Synchronization API','Background & PWA',()=>path('SyncManager')||proto('ServiceWorkerRegistration','sync'),'background-sync'),
    A('Background Tasks API','Scheduling',()=>path('requestIdleCallback'),'idle-callback'),
    A('Badging API','Background & PWA',()=>path('navigator.setAppBadge')||path('navigator.clearAppBadge'),'badge','Usually useful for installed PWAs'),
    A('Barcode Detection API','Imaging',()=>path('BarcodeDetector'),'barcode-formats'),
    A('Battery Status API','Device info',()=>path('navigator.getBattery'),'battery'),
    A('Beacon API','Networking',()=>path('navigator.sendBeacon'),'beacon'),
    A('Broadcast Channel API','Messaging',()=>path('BroadcastChannel'),'broadcast'),

    A('CSS Custom Highlight API','DOM & CSS',()=>path('CSS.highlights')&&path('Highlight'),'css-highlight'),
    A('CSS Font Loading API','DOM & CSS',()=>path('document.fonts')&&path('FontFace'),'font-loading'),
    A('CSS Painting API','DOM & CSS',()=>path('CSS.paintWorklet'),null,'Houdini paint worklet'),
    A('CSS Properties and Values API','DOM & CSS',()=>path('CSS.registerProperty'),'css-property'),
    A('CSS Typed Object Model API','DOM & CSS',()=>path('CSSStyleValue')||proto('Element','attributeStyleMap'),'css-typed-om'),
    A('CSS Object Model (CSSOM)','DOM & CSS',()=>path('CSSStyleSheet')&&path('getComputedStyle'),'cssom'),
    A('CSSOM view API','DOM & CSS',()=>path('window.visualViewport')||path('Element.prototype.getBoundingClientRect'),'cssom-view'),
    A('Canvas API','Graphics',()=>path('HTMLCanvasElement'),'canvas'),
    A('Channel Messaging API','Messaging',()=>path('MessageChannel'),'message-channel'),
    A('Clipboard API','User data',()=>path('navigator.clipboard'),'clipboard-read','Read/write tests require local approval'),
    A('Compression Streams API','Data processing',()=>path('CompressionStream')&&path('DecompressionStream'),'compression'),
    A('Compute Pressure API','Device info',()=>path('PressureObserver'),'compute-pressure','Availability and permission policy vary'),
    A('Console API','Developer',()=>path('console'),'console'),
    A('Contact Picker API','User data',()=>path('navigator.contacts.select'),'contacts','User chooses contacts'),
    A('Content Index API','Background & PWA',()=>proto('ServiceWorkerRegistration','index'),null,'Requires compatible service worker registration'),
    A('Cookie Store API','Storage',()=>path('cookieStore'),'cookie-store'),
    A('Credential Management API','Identity',()=>path('navigator.credentials'),'credentials-info','Credential operations can require user mediation'),

    A('Document Object Model (DOM)','DOM & CSS',()=>path('document.createElement'),'dom'),
    A('Device Memory API','Device info',()=> 'deviceMemory' in n,'device-memory'),
    A('Device orientation events','Sensors',()=>path('DeviceOrientationEvent')||path('DeviceMotionEvent'),'device-orientation'),
    A('Device Posture API','Device info',()=>path('navigator.devicePosture'),'device-posture'),
    A('Document Picture-in-Picture API','Media & audio',()=>path('documentPictureInPicture'),'document-pip'),

    A('EditContext API','Input',()=>path('EditContext'),'edit-context'),
    A('Encoding API','Data processing',()=>path('TextEncoder')&&path('TextDecoder'),'encoding'),
    A('Encrypted Media Extensions API','Media & audio',()=>path('navigator.requestMediaKeySystemAccess')&&path('MediaKeys'),null,'Requires a DRM/key-system configuration'),
    A('EyeDropper API','User interaction',()=>path('EyeDropper'),'eye-dropper'),

    A('Federated Credential Management (FedCM) API','Identity',()=>path('IdentityCredential')||path('navigator.credentials.get'),'fedcm-info','A real flow requires an identity provider'),
    A('Fenced Frame API','Privacy & ads',()=>path('HTMLFencedFrameElement')||('fence' in g),null,'Privacy sandbox / browser-specific'),
    A('Fetch API','Networking',()=>path('fetch')&&path('Request')&&path('Response'),'fetch'),
    A('File API','Files',()=>path('File')&&path('FileReader')&&path('Blob'),'file-api'),
    A('File System API','Files',()=>path('showOpenFilePicker')||path('navigator.storage.getDirectory'),'file-open'),
    A('File and Directory Entries API','Files',()=>proto('DataTransferItem','webkitGetAsEntry')||path('FileSystemEntry'),null,'Legacy/drag-and-drop oriented API'),
    A('Force Touch events','Input',()=>('onwebkitmouseforcechanged' in g)||path('WebKitMouseForceEvent'),null,'Apple/WebKit-specific legacy surface'),
    A('Fullscreen API','User interaction',()=>proto('Element','requestFullscreen'),'fullscreen'),

    A('Gamepad API','Input',()=>path('navigator.getGamepads'),'gamepad'),
    A('Geolocation API','Sensors',()=>path('navigator.geolocation'),'geolocation'),
    A('Geometry interfaces','Graphics',()=>path('DOMPoint')&&path('DOMRect')&&path('DOMMatrix'),'geometry'),

    A('HTML DOM API','DOM & CSS',()=>path('HTMLElement')&&path('HTMLDocument'),'html-dom'),
    A('HTML Drag and Drop API','Input',()=>path('DataTransfer')&&('ondragstart' in d.documentElement),'drag-drop'),
    A('HTML Sanitizer API','Security',()=>path('Sanitizer')||proto('Element','setHTML'),'sanitizer'),
    A('History API','Navigation',()=>path('history.pushState'),'history'),
    A('Houdini APIs','DOM & CSS',()=>path('CSS.registerProperty')||path('CSS.paintWorklet')||path('CSSStyleValue'),null,'Umbrella detection for Houdini surfaces'),

    A('Idle Detection API','Sensors',()=>path('IdleDetector'),'idle-detector'),
    A('IndexedDB API','Storage',()=>path('indexedDB'),'indexeddb'),
    A('Ink API','Input',()=>path('navigator.ink'),'ink'),
    A('InputDeviceCapabilities API','Input',()=>path('InputDeviceCapabilities'),'input-capabilities'),
    A('Insertable Streams for MediaStreamTrack API','Media & audio',()=>path('MediaStreamTrackProcessor')||path('MediaStreamTrackGenerator'),'insertable-media'),
    A('Intersection Observer API','Observers',()=>path('IntersectionObserver'),'intersection'),
    A('Invoker Commands API','DOM & CSS',()=>('commandForElement' in HTMLButtonElement.prototype)||('command' in HTMLButtonElement.prototype),null,'Declarative command/invoker feature'),

    A('JS Self-Profiling API','Performance',()=>path('Profiler'),null,'Experimental / policy-controlled'),
    A('Keyboard API','Input',()=>path('navigator.keyboard'),'keyboard-layout'),
    A('Launch Handler API','Background & PWA',()=>path('window.launchQueue'),null,'Installed-PWA launch integration'),
    A('Local Font Access API','User data',()=>path('queryLocalFonts'),'local-fonts'),

    A('MediaStream Image Capture API','Imaging',()=>path('ImageCapture'),'image-capture'),
    A('Media Capabilities API','Media & audio',()=>path('navigator.mediaCapabilities'),'media-capabilities'),
    A('Media Capture and Streams API (Media Stream)','Media & audio',()=>path('navigator.mediaDevices.getUserMedia'),'camera'),
    A('Media Session API','Media & audio',()=>path('navigator.mediaSession'),'media-session'),
    A('Media Source API','Media & audio',()=>path('MediaSource'),'media-source'),
    A('MediaStream Recording API','Media & audio',()=>path('MediaRecorder'),'media-recorder'),

    A('Navigation API','Navigation',()=>path('navigation'),'navigation'),
    A('Network Information API','Device info',()=>path('navigator.connection')||path('navigator.mozConnection')||path('navigator.webkitConnection'),'network'),
    A('Notifications API','Background & PWA',()=>path('Notification'),'notifications'),

    A('Page Visibility API','Navigation',()=> 'visibilityState' in d,'visibility'),
    A('Payment Request API','Payments',()=>path('PaymentRequest'),'payment'),
    A('Performance APIs','Performance',()=>path('performance')&&path('PerformanceObserver'),'performance'),
    A('Permissions API','Security',()=>path('navigator.permissions'),'permissions'),
    A('Picture-in-Picture API','Media & audio',()=>('pictureInPictureEnabled' in d)||proto('HTMLVideoElement','requestPictureInPicture'),'pip'),
    A('Pointer events','Input',()=>path('PointerEvent'),'pointer-events'),
    A('Pointer Lock API','Input',()=>proto('Element','requestPointerLock'),'pointer-lock'),
    A('Popover API','DOM & CSS',()=>proto('HTMLElement','showPopover'),'popover'),
    A('Presentation API','Media & audio',()=>path('PresentationRequest'),null,'Requires a compatible presentation display'),
    A('Prioritized Task Scheduling API','Scheduling',()=>path('scheduler.postTask'),'scheduler'),
    A('Private State Token API','Privacy & ads',()=>path('PrivateToken')||('privateToken' in Request.prototype),null,'Privacy feature / browser support varies'),
    A('Prompt API','AI',()=>path('LanguageModel')||path('ai.languageModel')||path('ai.createTextSession'),'prompt-api','Built-in AI availability varies'),
    A('Push API','Background & PWA',()=>path('PushManager')||proto('ServiceWorkerRegistration','pushManager'),null,'Push subscription also requires a push service/backend'),

    A('Remote Playback API','Media & audio',()=>proto('HTMLMediaElement','remote'),null,'Requires a compatible remote playback target'),
    A('Reporting API','Performance',()=>path('ReportingObserver'),'reporting'),
    A('Resize Observer API','Observers',()=>path('ResizeObserver'),'resize-observer'),

    A('SVG API','Graphics',()=>path('SVGElement')&&path('SVGSVGElement'),'svg'),
    A('Screen Capture API','Media & audio',()=>path('navigator.mediaDevices.getDisplayMedia'),'screen'),
    A('Screen Orientation API','Device info',()=>path('screen.orientation'),'screen-orientation'),
    A('Screen Wake Lock API','Device info',()=>path('navigator.wakeLock'),'wake-lock'),
    A('Selection API','DOM & CSS',()=>path('getSelection')&&path('Selection'),'selection'),
    A('Sensor APIs','Sensors',()=>any('Accelerometer','Gyroscope','Magnetometer','AbsoluteOrientationSensor','RelativeOrientationSensor','AmbientLightSensor'),'sensor-sample'),
    A('Server-sent events','Networking',()=>path('EventSource'),null,'Requires an SSE server endpoint'),
    A('Service Worker API','Background & PWA',()=>path('navigator.serviceWorker')&&path('ServiceWorkerRegistration'),'service-worker'),
    A('Shared Storage API','Privacy & ads',()=>path('sharedStorage')||path('window.sharedStorage'),null,'Privacy sandbox / limited availability'),
    A('Speculation Rules API','Navigation',()=>typeof HTMLScriptElement!=='undefined' && HTMLScriptElement.supports?.('speculationrules')===true,'speculation'),
    A('Storage API','Storage',()=>path('navigator.storage'),'storage-estimate'),
    A('Storage Access API','Storage',()=>path('document.requestStorageAccess')||path('document.hasStorageAccess'),'storage-access'),
    A('Streams API','Data processing',()=>path('ReadableStream')&&path('WritableStream')&&path('TransformStream'),'streams'),
    A('Summarizer API','AI',()=>path('Summarizer')||path('ai.summarizer'),'summarizer-info'),

    A('Topics API','Privacy & ads',()=>path('document.browsingTopics'),null,'Privacy sandbox / policy dependent'),
    A('Touch events','Input',()=>('ontouchstart' in g)||path('TouchEvent'),'touch-events'),
    A('Translator and Language Detector APIs','AI',()=>path('Translator')||path('LanguageDetector')||path('ai.translator')||path('ai.languageDetector'),'translation-info'),
    A('Trusted Types API','Security',()=>path('trustedTypes')&&path('TrustedHTML'),'trusted-types'),

    A('UI Events','Input',()=>path('UIEvent')&&path('KeyboardEvent')&&path('MouseEvent'),'ui-events'),
    A('URL API','Navigation',()=>path('URL')&&path('URLSearchParams'),'url'),
    A('URL Fragment Text Directives','Navigation',()=>path('document.fragmentDirective')||('fragmentDirective' in d),null,'Browser support varies'),
    A('URL Pattern API','Navigation',()=>path('URLPattern'),'url-pattern'),
    A('User Preferences API','Device info',()=>path('matchMedia'),'user-preferences'),
    A('User-Agent Client Hints API','Device info',()=>path('navigator.userAgentData'),'ua-hints'),

    A('Vibration API','Device info',()=>path('navigator.vibrate'),'vibration'),
    A('View Transition API','DOM & CSS',()=>path('document.startViewTransition'),'view-transition'),
    A('Viewport Segments API','Device info',()=>globalThis.CSS?.supports?.('top: env(viewport-segment-top 0 0)')===true,null,'Foldable/multi-segment display feature'),
    A('VirtualKeyboard API','Input',()=>path('navigator.virtualKeyboard'),'virtual-keyboard'),

    A('Web Bluetooth API','Hardware',()=>path('navigator.bluetooth'),'bluetooth'),
    A('Web Periodic Background Synchronization API','Background & PWA',()=>path('PeriodicSyncManager')||proto('ServiceWorkerRegistration','periodicSync'),null,'Installed/PWA/browser restrictions commonly apply'),
    A('Web Animations API','DOM & CSS',()=>proto('Element','animate')&&path('Animation'),'web-animations'),
    A('Web Audio API','Media & audio',()=>path('AudioContext')||path('webkitAudioContext'),'web-audio'),
    A('Web Authentication API','Identity',()=>path('PublicKeyCredential')&&path('navigator.credentials'),'webauthn'),
    A('Web Components','DOM & CSS',()=>path('customElements')&&path('ShadowRoot'),'web-components'),
    A('Web Crypto API','Security',()=>path('crypto.subtle'),'crypto'),
    A('Web Locks API','Scheduling',()=>path('navigator.locks'),'web-locks'),
    A('Web MIDI API','Hardware',()=>path('navigator.requestMIDIAccess'),'midi'),
    A('Web NFC API','Hardware',()=>path('NDEFReader'),'nfc'),
    A('Web Serial API','Hardware',()=>path('navigator.serial'),'serial'),
    A('Web Share API','User interaction',()=>path('navigator.share'),'share'),
    A('Web Speech API','Media & audio',()=>path('speechSynthesis')||path('SpeechRecognition')||path('webkitSpeechRecognition'),'speech'),
    A('Web Storage API','Storage',()=>path('localStorage')&&path('sessionStorage'),'web-storage'),
    A('Web Workers API','Scheduling',()=>path('Worker'),'worker'),
    A('Web-based Payment Handler API','Payments',()=>path('PaymentManager')||proto('ServiceWorkerRegistration','paymentManager'),null,'Usually requires a payment handler service worker'),
    A('WebCodecs API','Media & audio',()=>path('VideoDecoder')||path('AudioDecoder'),'webcodecs'),
    A('WebGL: 2D and 3D graphics for the web','Graphics',()=>path('WebGLRenderingContext'),'webgl'),
    A('WebGPU API','Graphics',()=>path('navigator.gpu'),'webgpu'),
    A('WebHID API','Hardware',()=>path('navigator.hid'),'hid'),
    A('WebOTP API','Identity',()=>path('OTPCredential')||path('navigator.credentials'),'webotp-info','Real WebOTP requires a correctly formatted SMS and supported platform'),
    A('WebRTC API','Networking',()=>path('RTCPeerConnection'),'webrtc-info'),
    A('WebSocket API (WebSockets)','Networking',()=>path('WebSocket'),'websocket-info','A real test requires a WebSocket endpoint'),
    A('WebTransport API','Networking',()=>path('WebTransport'),'webtransport-info','A real test requires an HTTP/3 WebTransport server'),
    A('WebUSB API','Hardware',()=>path('navigator.usb'),'usb'),
    A('WebVR API','XR',()=>path('VRDisplay')||path('navigator.getVRDisplays'),null,'Deprecated; superseded by WebXR'),
    A('WebVTT API','Media & audio',()=>path('VTTCue'),'webvtt'),
    A('WebXR Device API','XR',()=>path('navigator.xr'),'webxr'),
    A('Window Controls Overlay API','Background & PWA',()=>path('navigator.windowControlsOverlay'),'window-controls-overlay'),
    A('Window Management API','User data',()=>path('getScreenDetails')||path('window.getScreenDetails'),'window-management'),
    A('XMLHttpRequest API','Networking',()=>path('XMLHttpRequest'),'xhr')
  ];
})();