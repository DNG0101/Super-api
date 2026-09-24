(() => {
  'use strict';
  if (window.__superApiPeerHookInstalled) return;
  const NativePC = window.RTCPeerConnection || window.webkitRTCPeerConnection;
  if (!NativePC) return;
  window.__superApiPeerHookInstalled = true;
  window.__superApiTrackedChannels = window.__superApiTrackedChannels || new Set();
  window.__superApiTrackedPeers = window.__superApiTrackedPeers || new Set();

  function safeSend(ch, payload) {
    try {
      if (ch && ch.readyState === 'open') ch.send(JSON.stringify(payload));
    } catch {}
  }

  function trackChannel(ch) {
    if (!ch || ch.__superApiExtTracked) return ch;
    Object.defineProperty(ch, '__superApiExtTracked', { value:true, configurable:true });
    window.__superApiTrackedChannels.add(ch);

    ch.addEventListener('message', event => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      if (!msg || msg.type !== 'request' || typeof msg.action !== 'string' || !msg.action.startsWith('ext:')) return;

      event.stopImmediatePropagation();
      const handler = window.SUPER_API_EXT_HANDLE;
      if (typeof handler !== 'function') {
        safeSend(ch, {type:'error', action:msg.action, id:msg.id, error:'Extension action engine is not ready.'});
        return;
      }
      Promise.resolve(handler(ch, msg)).catch(err => {
        safeSend(ch, {type:'error', action:msg.action, id:msg.id, error:err?.message || String(err)});
      });
    }, true);

    ch.addEventListener('close', () => window.__superApiTrackedChannels.delete(ch), {once:true});
    return ch;
  }

  function trackPeer(pc) {
    if (!pc) return pc;
    if (pc.__superApiPeerTracked) {
      window.__superApiTrackedPeers.add(pc);
      return pc;
    }
    Object.defineProperty(pc, '__superApiPeerTracked', { value:true, configurable:true });
    window.__superApiTrackedPeers.add(pc);

    const nativeCreate = pc.createDataChannel.bind(pc);
    pc.createDataChannel = (...args) => trackChannel(nativeCreate(...args));
    pc.addEventListener('datachannel', e => trackChannel(e.channel), true);
    pc.addEventListener('connectionstatechange', () => {
      if (pc.connectionState === 'closed') window.__superApiTrackedPeers.delete(pc);
    });
    pc.addEventListener('iceconnectionstatechange', () => {
      if (pc.iceConnectionState === 'closed') window.__superApiTrackedPeers.delete(pc);
    });
    return pc;
  }

  const WrappedPC = new Proxy(NativePC, {
    construct(target, args) {
      return trackPeer(Reflect.construct(target, args, target));
    }
  });

  try { window.RTCPeerConnection = WrappedPC; } catch {}
  try { if (window.webkitRTCPeerConnection) window.webkitRTCPeerConnection = WrappedPC; } catch {}
  window.__superApiTrackChannel = trackChannel;
  window.__superApiTrackPeer = trackPeer;
})();
