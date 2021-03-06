/*************************************************************************
 * Startup observer (JavaScript XPCOM component)
 *
 * Cases tested (each during Tor and Non-Tor, FF4 and FF3.6)
 *    1. Crash
 *    2. Upgrade
 *    3. Fresh install
 *
 *************************************************************************/

const Cc = Components.classes
const Ci = Components.interfaces
const Cr = Components.results
const Cu = Components.utils

Cu.import("resource://gre/modules/Services.jsm")
Cu.import("resource://gre/modules/XPCOMUtils.jsm")
XPCOMUtils.defineLazyModuleGetter(this, "FileUtils", "resource://gre/modules/FileUtils.jsm")

Cu.import("resource://i2pbutton/modules/default-prefs.js", {}).ensureDefaultPrefs()

// Module specific constants
const kMODULE_NAME = "Startup"
const kMODULE_CONTRACTID = "@geti2p.net/startup-observer;1"
const kMODULE_CID = Components.ID("06322def-6fde-4c06-aef6-47ae8e799629")

function StartupObserver() {
    this.logger = Cc["@geti2p.net/i2pbutton-logger;1"].getService(Ci.nsISupports).wrappedJSObject
    this._prefs = Services.prefs
    this.logger.log(3, "Startup Observer created")

    var env = Cc["@mozilla.org/process/environment;1"].getService(Ci.nsIEnvironment)
    var prefName = "browser.startup.homepage"
    if (env.exists("I2P_DEFAULT_HOMEPAGE")) {
      // if the user has set this value in a previous installation, don't override it
      if (!this._prefs.prefHasUserValue(prefName)) {
        this._prefs.setCharPref(prefName, env.get("I2P_DEFAULT_HOMEPAGE"))
      }
    }

    try {
      var test = this._prefs.getCharPref("i2pbrowser.version");
      this.is_iibb = true;
      this.logger.log(3, "This is a I2P Browser's XPCOM");
    } catch(e) {
      this.logger.log(3, "This is not a I2P Browser's XPCOM");
    }

    try {
      this.setProxySettings();
    } catch(e) {
      this.logger.log(4, "Early proxy change failed. Will try again at profile load. Error: "+e);
    }

    // Arrange for our about:i2p handler to be loaded in the default (chrome)
    // process as well as in each content process.
    let ppmm = Cc["@mozilla.org/parentprocessmessagemanager;1"]
                 .getService(Ci.nsIProcessScriptLoader);
    ppmm.loadProcessScript("resource://i2pbutton/components/aboutI2p.js", true)
}

StartupObserver.prototype = {
    // Bug 6803: We need to get the env vars early due to
    // some weird proxy caching code that showed up in FF15.
    // Otherwise, homepage domain loads fail forever.
    setProxySettings: function() {
      if (!this.is_iibb)
        return;

      this.logger.log(3, "Resetting I2P settings to standard");
      this._prefs.setBoolPref("network.proxy.socks_remote_dns", false);
      this._prefs.setIntPref("network.proxy.type", 1);
      this._prefs.setIntPref("network.proxy.socks_port", 0);
      this._prefs.setCharPref("network.proxy.socks", "");
      this._prefs.setIntPref("extensions.i2pbutton.console_port_i2pj", 7647);
      this._prefs.setCharPref("network.proxy.http", "127.0.0.1");
      this._prefs.setIntPref("network.proxy.http_port", 7644);
      this._prefs.setCharPref("network.proxy.ssl", "127.0.0.1");
      this._prefs.setIntPref("network.proxy.ssl_port", 7644);
      this._prefs.setCharPref("network.proxy.ftp", "127.0.0.1");
      this._prefs.setIntPref("network.proxy.ftp_port", 7644);
      this._prefs.setCharPref("network.proxy.no_proxies_on", "localhost, 127.0.0.1");

      // Force prefs to be synced to disk
      Services.prefs.savePrefFile(null);

      this.logger.log(3, "Synced network settings to environment.");
    },

    observe: function(subject, topic, data) {
      if(topic == "profile-after-change") {
        // Bug 1506 P1: We listen to these prefs as signals for startup,
        // but only for hackish reasons.
        this._prefs.setBoolPref("extensions.i2pbutton.startup", true);

	      // We need to listen for NoScript before it starts.
        NoScriptControl.initialize();

        this.setProxySettings();
      }

      // In all cases, force prefs to be synced to disk
      Services.prefs.savePrefFile(null);
    },

  QueryInterface: function(iid) {
    if (iid.equals(Ci.nsISupports)) {
        return this;
    }
    if(iid.equals(Ci.nsIClassInfo)) {
      return this;
    }
    return this;
  },

  // method of nsIClassInfo
  classDescription: "I2pbutton Startup Observer",
  classID: kMODULE_CID,
  contractID: kMODULE_CONTRACTID,

  // Hack to get us registered early to observe recovery
  _xpcom_categories: [{category:"profile-after-change"}],

  getInterfaces: function(count) {
    var interfaceList = [nsIClassInfo];
    count.value = interfaceList.length;
    return interfaceList;
  },
  getHelperForLanguage: function(count) { return null; }

};

var NSGetFactory = XPCOMUtils.generateNSGetFactory([StartupObserver]);