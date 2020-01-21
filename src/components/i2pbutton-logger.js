// TODO: Slowly migrate to firefox's Log module "resource://gre/modules/Log.jsm"
// Module specific constants
const kMODULE_NAME = "I2pbutton Logger"
const kMODULE_CONTRACTID = "@geti2p.net/i2pbutton-logger;1"
const kMODULE_CID = Components.ID("f36d72c9-9718-4134-b550-e109638331d7")

const Cc = Components.classes
const Ci = Components.interfaces
const Cu = Components.utils

const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
const { XPCOMUtils } = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

Cu.import("resource://i2pbutton/modules/default-prefs.js", {}).ensureDefaultPrefs()
Cu.import("resource://gre/modules/Log.jsm")

let console = (Cu.import("resource://gre/modules/Console.jsm", {})).console

function I2pbuttonLogger() {
  // Register observer
  Services.prefs.addObserver("extensions.i2pbutton", this, false);

  this.loglevel = Services.prefs.getIntPref("extensions.i2pbutton.loglevel");
  this.logmethod = Services.prefs.getIntPref("extensions.i2pbutton.logmethod");

  try {
    var logMngr = Cc["@mozmonkey.com/debuglogger/manager;1"].getService(Ci.nsIDebugLoggerManager);
    this._debuglog = logMngr.registerLogger("i2pbutton");
  } catch (exErr) {
    this._debuglog = false;
  }
  this._console = Services.console;

  // This JSObject is exported directly to chrome
  this.wrappedJSObject = this;
  this.log(3, "I2pbutton debug output ready");
}

/**
 * JS XPCOM component registration goop:
 *
 * Everything below is boring boilerplate and can probably be ignored.
 */

const nsISupports = Components.interfaces.nsISupports;
const nsIClassInfo = Components.interfaces.nsIClassInfo;
const nsIComponentRegistrar = Components.interfaces.nsIComponentRegistrar;
const nsIObserverService = Components.interfaces.nsIObserverService;

const logString = { 1:"VERB", 2:"DBUG", 3: "INFO", 4:"NOTE", 5:"WARN", 6:"ERRO" };

function padInt(i)
{
  return (i < 10) ? '0' + i : i;
}

I2pbuttonLogger.prototype =
{
  QueryInterface: function(iid)
  {
    if (!iid.equals(nsIClassInfo) &&
        !iid.equals(nsISupports)) {
      Components.returnCode = Cr.NS_ERROR_NO_INTERFACE;
      return null;
    }
    return this;
  },

  wrappedJSObject: null,  // Initialized by constructor

  // make this an nsIClassInfo object
  flags: nsIClassInfo.DOM_OBJECT,

  // method of nsIClassInfo
  classDescription: "I2pbuttonLogger",
  classID: kMODULE_CID,
  contractID: kMODULE_CONTRACTID,

  // method of nsIClassInfo
  getInterfaces: function(count) {
    var interfaceList = [nsIClassInfo];
    count.value = interfaceList.length;
    return interfaceList;
  },

  // method of nsIClassInfo
  getHelperForLanguage: function(count) { return null; },

  formatLog: function(str, level) {
    var d = new Date()
    var now = padInt(d.getUTCMonth()+1)+"-"+padInt(d.getUTCDate())+" "+padInt(d.getUTCHours())+":"+padInt(d.getUTCMinutes())+":"+padInt(d.getUTCSeconds())
    return "["+now+"] I2pbutton "+logString[level]+": "+str
  },

  // error console log
  eclog: function(level, str) {
    switch(this.logmethod) {
      case 0: // stderr
        if(this.loglevel <= level)
          dump(this.formatLog(str, level)+"\n");
        break;
      default: // errorconsole
        if(this.loglevel <= level)
          this._console.logStringMessage(this.formatLog(str,level));
        break;
    }
  },

  safe_log: function(level, str, scrub) {
    if (this.loglevel < 4) {
      this.eclog(level, str+scrub);
    } else {
      this.eclog(level, str+" [scrubbed]");
    }
  },

  log: function(level, str) {
    switch(this.logmethod) {
      case 2: // debuglogger
        if(this._console) {
          this._console.log((6-level), this.formatLog(str,level));
          break;
        }
        // fallthrough
      case 0: // stderr
        if(this.loglevel <= level)
          dump(this.formatLog(str,level)+"\n");
        break;
      default:
          dump("Bad log method: "+this.logmethod);
      case 1: // errorconsole
        if(this.loglevel <= level)
          this._console.logStringMessage(this.formatLog(str,level));
        break;
    }
  },

  error: function(str) { this.log(6, str) },
  warn: function(str) { this.log(5, str) },
  note: function(str) { this.log(4, str) },
  info: function(str) { this.log(3, str) },
  debug: function(str) { this.log(2, str) },
  verbose: function(str) { this.log(1, str) },

  // Pref observer interface implementation

  // topic:   what event occurred
  // subject: what nsIPrefBranch we're observing
  // data:    which pref has been changed (relative to subject)
  observe: function(subject, topic, data)
  {
    if (topic != "nsPref:changed") return;
    switch (data) {
      case "extensions.i2pbutton.logmethod":
        this.logmethod = Services.prefs.getIntPref("extensions.i2pbutton.logmethod");
        if (this.logmethod === 0) {
          Services.prefs.setBoolPref("browser.dom.window.dump.enabled",
            true);
        } else if (Services.prefs.
          getIntPref("extensions.i2plauncher.logmethod", 3) !== 0) {
          // If I2P Launcher is not available or its log method is not 0
          // then let's reset the dump pref.
          Services.prefs.setBoolPref("browser.dom.window.dump.enabled",
            false);
        }
        break;
      case "extensions.i2pbutton.loglevel":
        this.loglevel = Services.prefs.getIntPref("extensions.i2pbutton.loglevel");
        break;
    }
  }
}

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm")
var NSGetFactory = XPCOMUtils.generateNSGetFactory([I2pbuttonLogger])
