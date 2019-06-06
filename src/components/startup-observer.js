/*************************************************************************
 * Startup observer (JavaScript XPCOM component)
 *
 * Cases tested (each during Tor and Non-Tor, FF4 and FF3.6)
 *    1. Crash
 *    2. Upgrade
 *    3. Fresh install
 *
 *************************************************************************/

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "FileUtils",
                                  "resource://gre/modules/FileUtils.jsm");

Cu.import("resource://i2pbutton/modules/default-prefs.js", {}).ensureDefaultPrefs();
//let NoScriptControl = Cu.import("resource://torbutton/modules/noscript-control.js", {});

// Module specific constants
const kMODULE_NAME = "Startup";
const kMODULE_CONTRACTID = "@geti2p.net/startup-observer;1";
const kMODULE_CID = Components.ID("06322def-6fde-4c06-aef6-47ae8e799629");

function StartupObserver() {
    this.logger = Cc["@geti2p.net/i2pbutton-logger;1"]
                    .getService(Ci.nsISupports).wrappedJSObject;
    this._prefs = Services.prefs;
    this.logger.log(3, "Startup Observer created");

    var env = Cc["@mozilla.org/process/environment;1"]
                .getService(Ci.nsIEnvironment);
    var prefName = "browser.startup.homepage";
    if (env.exists("TOR_DEFAULT_HOMEPAGE")) {
      // if the user has set this value in a previous installation, don't override it
      if (!this._prefs.prefHasUserValue(prefName)) {
        this._prefs.setCharPref(prefName, env.get("TOR_DEFAULT_HOMEPAGE"));
      }
    }

    try {
      var test = this._prefs.getCharPref("i2pbrowser.version");
      this.is_tbb = true;
      this.logger.log(3, "This is a I2P Browser's XPCOM");
    } catch(e) {
      this.logger.log(3, "This is not a I2P Browser's XPCOM");
    }

    try {
      // XXX: We're in a race with HTTPS-Everywhere to update our proxy settings
      // before the initial SSL-Observatory test... If we lose the race, Firefox
      // caches the old proxy settings for check.tp.o somehwere, and it never loads :(
      this.setProxySettings();
    } catch(e) {
      this.logger.log(4, "Early proxy change failed. Will try again at profile load. Error: "+e);
    }

    // Arrange for our about:tor handler to be loaded in the default (chrome)
    // process as well as in each content process.
    let ppmm = Cc["@mozilla.org/parentprocessmessagemanager;1"]
                 .getService(Ci.nsIProcessScriptLoader);
    ppmm.loadProcessScript("resource://i2pbutton/components/aboutI2p.js",
                            true);
}

StartupObserver.prototype = {
    // Bug 6803: We need to get the env vars early due to
    // some weird proxy caching code that showed up in FF15.
    // Otherwise, homepage domain loads fail forever.
    setProxySettings: function() {
      if (!this.is_tbb)
        return;

      // Bug 1506: Still want to get these env vars
      let environ = Cc["@mozilla.org/process/environment;1"]
                      .getService(Ci.nsIEnvironment);
      if (environ.exists("TOR_TRANSPROXY")) {
        /*
        this.logger.log(3, "Resetting Tor settings to transproxy");
        this._prefs.setBoolPref("network.proxy.socks_remote_dns", false);
        this._prefs.setIntPref("network.proxy.type", 0);
        this._prefs.setIntPref("network.proxy.socks_port", 0);
        this._prefs.setCharPref("network.proxy.socks", "");
        */
      } else {

        // Try to retrieve SOCKS proxy settings from Tor Launcher.
        let socksPortInfo;
        try {
          //let tlps = Cc["@torproject.org/torlauncher-protocol-service;1"]
          //           .getService(Ci.nsISupports).wrappedJSObject;
          //socksPortInfo = tlps.TorGetSOCKSPortInfo();
        } catch(e) {
          this.logger.log(3, "i2p launcher failed " + e);
        }

        // If Tor Launcher is not available, check environment variables.
        if (!socksPortInfo) {
          socksPortInfo = { ipcFile: undefined, host: undefined, port: 0 };

          let isWindows = Services.appinfo.OS === "WINNT";
          if (!isWindows && environ.exists("TOR_SOCKS_IPC_PATH")) {
            socksPortInfo.ipcFile = new FileUtils.File(
                                           environ.get("TOR_SOCKS_IPC_PATH"));
          }
          else
          {
            if (environ.exists("TOR_SOCKS_HOST"))
              socksPortInfo.host = environ.get("TOR_SOCKS_HOST");
            if (environ.exists("TOR_SOCKS_PORT"))
              socksPortInfo.port = parseInt(environ.get("TOR_SOCKS_PORT"));
          }
        }

        // Adjust network.proxy prefs.
        if (socksPortInfo.ipcFile) {
          let fph = Services.io.getProtocolHandler("file")
                               .QueryInterface(Ci.nsIFileProtocolHandler);
          let fileURI = fph.newFileURI(socksPortInfo.ipcFile);
          this.logger.log(3, "Reset socks to "+fileURI.spec);
          //this._prefs.setCharPref("network.proxy.socks", fileURI.spec);
          //this._prefs.setIntPref("network.proxy.socks_port", 0);
        } else {
          if (socksPortInfo.host) {
            //this._prefs.setCharPref("network.proxy.socks", socksPortInfo.host);
            this.logger.log(3, "Reset socks host to "+socksPortInfo.host);
          }
          if (socksPortInfo.port) {
            //this._prefs.setIntPref("network.proxy.socks_port",
            //                       socksPortInfo.port);
            this.logger.log(3, "Reset socks port to "+socksPortInfo.port);
          }
        }

        if (socksPortInfo.ipcFile || socksPortInfo.host || socksPortInfo.port) {
          //this._prefs.setBoolPref("network.proxy.socks_remote_dns", true);
          //this._prefs.setIntPref("network.proxy.type", 1);
        }
      }

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
        //NoScriptControl.initialize();

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