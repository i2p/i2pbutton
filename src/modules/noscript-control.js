// # NoScript settings control (for binding to Security Slider)

/* jshint esversion:6 */

// ## Utilities

const { utils: Cu } = Components;
const { Services } = Cu.import("resource://gre/modules/Services.jsm", {});
const { LegacyExtensionContext } =
      Cu.import("resource://gre/modules/LegacyExtensionsUtils.jsm", {});
let logger = Components.classes["@geti2p.net/i2pbutton-logger;1"]
    .getService(Components.interfaces.nsISupports).wrappedJSObject;
let log = (level, msg) => logger.log(level, msg);


// __prefs__. A shortcut to Mozilla Services.prefs.
let prefs = Services.prefs;

// __getPrefValue(prefName)__
// Returns the current value of a preference, regardless of its type.
var getPrefValue = function (prefName) {
  switch(prefs.getPrefType(prefName)) {
    case prefs.PREF_BOOL: return prefs.getBoolPref(prefName);
    case prefs.PREF_INT: return prefs.getIntPref(prefName);
    case prefs.PREF_STRING: return prefs.getCharPref(prefName);
    default: return null;
  }
};

// __bindPref(prefName, prefHandler, init)__
// Applies prefHandler whenever the value of the pref changes.
// If init is true, applies prefHandler to the current value.
// Returns a zero-arg function that unbinds the pref.
var bindPref = function (prefName, prefHandler, init = false) {
  let update = () => { prefHandler(getPrefValue(prefName)); },
      observer = { observe : function (subject, topic, data) {
                    if (data === prefName) {
                      update();
                    }
                  } };
  prefs.addObserver(prefName, observer, false);
  if (init) {
    update();
  }
  return () => { prefs.removeObserver(prefName, observer); };
};

// __bindPrefAndInit(prefName, prefHandler)__
// Applies prefHandler to the current value of pref specified by prefName.
// Re-applies prefHandler whenever the value of the pref changes.
// Returns a zero-arg function that unbinds the pref.
var bindPrefAndInit = (prefName, prefHandler) =>
    bindPref(prefName, prefHandler, true);

// ## NoScript settings

// Minimum and maximum capability states as controlled by NoScript.
const max_caps = ["fetch", "font", "frame", "media", "object", "other", "script", "webgl"];
const min_caps = ["frame", "other"];

// Untrusted capabilities for [Standard, Safer, Safest] safety levels.
const untrusted_caps = [
  max_caps, // standard safety: neither http nor https
  ["frame", "font", "object", "other"], // safer: http
  min_caps, // safest: neither http nor https
];

// Default capabilities for [Standard, Safer, Safest] safety levels.
const default_caps = [
  max_caps, // standard: both http and https
  ["fetch", "font", "frame", "object", "other", "script"], // safer: https only
  min_caps, // safest: both http and https
];

// __noscriptSettings(safetyLevel)__.
// Produces NoScript settings with policy according to
// the safetyLevel which can be:
// 0 = Standard, 1 = Safer, 2 = Safest
//
// At the "Standard" safety level, we leave all sites at
// default with maximal capabilities. Essentially no content
// is blocked.
//
// At "Safer", we set all http sites to untrusted,
// and all https sites to default. Scripts are only permitted
// on https sites. Neither type of site is supposed to allow
// media, but both allow fonts (as we used in legacy NoScript).
//
// At "Safest", all sites are at default with minimal
// capabilities. Most things are blocked.
let noscriptSettings = safetyLevel => (
  {
    "__meta": {
      "name": "updateSettings",
      "recipientInfo": null
    },
    "policy": {
      "DEFAULT": {
        "capabilities": default_caps[safetyLevel],
        "temp": false
      },
      "TRUSTED": {
        "capabilities": max_caps,
        "temp": false
      },
      "UNTRUSTED": {
        "capabilities": untrusted_caps[safetyLevel],
        "temp": false
      },
      "sites": {
        "trusted": [],
        "untrusted": [[], ["http:"], []][safetyLevel],
        "custom": {},
        "temp": []
      },
      "enforced": true,
      "autoAllowTop": false
    },
   "isI2PBrowser": true,
   "tabId": -1
  });

// ## Communications

// The extension ID for NoScript (WebExtension)
const noscriptID = "{73a6fe31-595d-460b-a920-fcc0f8843232}";

// Ensure binding only occurs once.
let initialized = false;

// __initialize()__.
// The main function that binds the NoScript settings to the security
// slider pref state.
var initialize = () => {
  if (initialized) {
    return;
  }
  initialized = true;

  try {
    // A mock extension object that can communicate with another extension
    // via the WebExtensions sendMessage/onMessage mechanism.
    let extensionContext = new LegacyExtensionContext({ id : noscriptID });

    // The component that handles WebExtensions' sendMessage.
    let messageManager = extensionContext.messenger.messageManagers[0];

    // __setNoScriptSettings(settings)__.
    // NoScript listens for internal settings with onMessage. We can send
    // a new settings JSON object according to NoScript's
    // protocol and these are accepted! See the use of
    // `browser.runtime.onMessage.addListener(...)` in NoScript's bg/main.js.
    let sendNoScriptSettings = settings =>
        extensionContext.messenger.sendMessage(messageManager, settings, noscriptID);

    // __setNoScriptSafetyLevel(safetyLevel)__.
    // Set NoScript settings according to a particular safety level
    // (security slider level): 0 = Standard, 1 = Safer, 2 = Safest
    let setNoScriptSafetyLevel = safetyLevel =>
        sendNoScriptSettings(noscriptSettings(safetyLevel));

    // __securitySliderToSafetyLevel(sliderState)__.
    // Converts the "extensions.i2pbutton.security_slider" pref value
    // to a "safety level" value: 0 = Standard, 1 = Safer, 2 = Safest
    let securitySliderToSafetyLevel = sliderState =>
        [undefined, 2, 1, 1, 0][sliderState];

    // Wait for the first message from NoScript to arrive, and then
    // bind the security_slider pref to the NoScript settings.
    let messageListener = (a,b,c) => {
      try {
        log(3, `Message received from NoScript: ${JSON.stringify([a,b,c])}`);
        if (!["started", "pageshow"].includes(a.__meta.name)) {
          return;
        }
        extensionContext.api.browser.runtime.onMessage.removeListener(messageListener);
        let noscriptPersist = Services.prefs.getBoolPref("extensions.i2pbutton.noscript_persist", false);
        let noscriptInited = Services.prefs.getBoolPref("extensions.i2pbutton.noscript_inited", false);
        // Set the noscript safety level once if we have never run noscript
        // before, or if we are not allowing noscript per-site settings to be
        // persisted between browser sessions. Otherwise make sure that the
        // security slider position, if changed, will rewrite the noscript
        // settings.
        bindPref("extensions.i2pbutton.security_slider",
                 sliderState => setNoScriptSafetyLevel(securitySliderToSafetyLevel(sliderState)),
                 !noscriptPersist || !noscriptInited);
        if (!noscriptInited) {
          Services.prefs.setBoolPref("extensions.i2pbutton.noscript_inited", true);
        }
      } catch (e) {
        log(5, e.message);
      }
    };
    extensionContext.api.browser.runtime.onMessage.addListener(messageListener);
    log(3, "Listening for message from NoScript.");
  } catch (e) {
    log(5, e.message);
  }
};

// Export initialize() function for external use.
let EXPORTED_SYMBOLS = ["initialize"];
