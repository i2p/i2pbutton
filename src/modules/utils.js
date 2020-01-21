// ### Shortcut
let {classes: Cc, utils: Cu } = Components;

// ### Import Mozilla Services
Cu.import("resource://gre/modules/Services.jsm")
//Cu.import("resource://gre/modules/FileUtils.jsm")

// ### Import global URL
Cu.importGlobalProperties(["URL"])

//const ioService = Components.classes['@mozilla.org/network/io-service;1'].getService(Components.interfaces.nsIIOService)

String.prototype.trim = function () {
  return this.replace(/^\s*/, "").replace(/\s*$/, "");
}

/*
Array.prototype.contains = function(obj) {
  var i = this.length;
  while (i--) {
    if (this[i] === obj) {
      return true;
    }
  }
  return false;
}
*/

function loadScript(name, context) {
  // Create the Sandbox
  let sandbox = Components.utils.Sandbox(context, {
    sandboxPrototype: context,
    wantXrays: false
  });
  // Get the caller's filename
  let file = Components.caller.stack.filename;
  // Strip off any prefixes added by the sub-script loader
  // and the trailing filename
  let directory = file.replace(/.* -> |[^\/]+$/g, "");
  Services.scriptloader.loadSubScript(directory + name, sandbox, "UTF-8");
}
// The following function will import an arbitrary module into a singleton object,
// which it returns. If the argument is not an absolute path, the module is
// imported relative to the caller's filename.
function module(uri) {
  if (!/^[a-z-]+:/.exec(uri))
      uri = /([^ ]+\/)[^\/]+$/.exec(Components.stack.caller.filename)[1] + uri + ".jsm";
  let obj = {};
  Components.utils.import(uri, obj);
  return obj;
}

/**
 *
 *
var pps = Components.classes["@mozilla.org/network/protocol-proxy-service;1"]
          .getService(Components.interfaces.nsIProtocolProxyService);

// Create the proxy info object in advance to avoid creating one every time
var myProxyInfo = pps.newProxyInfo("http", "127.0.0.1", 8080, 0, -1, 0);

var filter = {
  applyFilter: function(pps, uri, proxy)
  {
    if (uri.spec == ...)
      return myProxyInfo;
    else
      return proxy;
  }
};
pps.registerFilter(filter, 1000);
 */

const getProfileDir = function() {
  let directoryService =
    Cc["@mozilla.org/file/directory_service;1"].
      getService(Ci.nsIProperties)
  // this is a reference to the profile dir (ProfD) now.
  let localDir = directoryService.get("ProfD", Ci.nsIFile)
  return localDir
}

function openFile(path, mode) {
  let file = Cc["@mozilla.org/file/local;1"].
             createInstance(Ci.nsILocalFile);
  file.initWithPath(path);
  let stream = Cc["@mozilla.org/network/file-output-stream;1"].
               createInstance(Ci.nsIFileOutputStream);
  stream.init(file, mode, -1, 0);
  return stream
}

function readfile(path) {
  var file = Components.classes['@mozilla.org/file/local;1'].createInstance(Components.interfaces.nsIFile);
  file.initWithPath(path);
  var fileStream = Components.classes['@mozilla.org/network/file-input-stream;1']
                   .createInstance(Components.interfaces.nsIFileInputStream);
  fileStream.init(file, 1, 0, false);
  var binaryStream = Components.classes['@mozilla.org/binaryinputstream;1']
                     .createInstance(Components.interfaces.nsIBinaryInputStream);
  binaryStream.setInputStream(fileStream);
  var array = binaryStream.readByteArray(fileStream.available());
  binaryStream.close();
  fileStream.close();
  return array_to_hexdigits(array);
}

// Bug 1506 P4: Control port interaction. Needed for New Identity.
function array_to_hexdigits(array) {
  return array.map(function(c) {
                     return String("0" + c.toString(16)).slice(-2)
                   }).join('');
}

function listExtensions(callbackFn) {
  AddonManager.getAddonsByTypes(["extension"], function(addons) {
    var addonData = [];

    for (let i in addons) {
      let cur = addons[i];
      addonData.push({
        id: cur.id.toString(),
        name: cur.name,
      });
    };
    console.log(JSON.stringify(addonData, null, '   '));
    callbackFn(addonData)
  });
}

//window.open("chrome://browser/content/browser.xul", "bmarks", "chrome,width=600,height=300")

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

// ## Observers

// __observe(topic, callback)__.
// Observe the given topic. When notification of that topic
// occurs, calls callback(subject, data). Returns a zero-arg
// function that stops observing.
var observe = function (topic, callback) {
  let observer = {
    observe: function (aSubject, aTopic, aData) {
      if (topic === aTopic) {
        callback(aSubject, aData);
      }
    },
  };
  Services.obs.addObserver(observer, topic, false);
  return () => Services.obs.removeObserver(observer, topic);
};

// ## Environment variables

// __env__.
// Provides access to process environment variables.
let env = Components.classes["@mozilla.org/process/environment;1"]
            .getService(Components.interfaces.nsIEnvironment);

// __getEnv(name)__.
// Reads the environment variable of the given name.
var getEnv = function (name) {
  return env.exists(name) ? env.get(name) : undefined;
};

// __getLocale
// Reads the browser locale, the default locale is en-US.
var getLocale = function() {
  return "en-US";
}

// ## Windows

// __dialogsByName__.
// Map of window names to dialogs.
let dialogsByName = {};

// __showDialog(parent, url, name, features, arg1, arg2, ...)__.
// Like window.openDialog, but if the window is already
// open, just focuses it instead of opening a new one.
var showDialog = function (parent, url, name, features) {
  let existingDialog = dialogsByName[name]
  if (existingDialog && !existingDialog.closed) {
    existingDialog.focus()
    return existingDialog
  } else {
    let newDialog = parent.openDialog.apply(parent, Array.slice(arguments, 1))
    dialogsByName[name] = newDialog
    return newDialog
  }
}

var openTabWithFocus = function (url) {
  gBrowser.selectedTab = gBrowser.addTab(url)
}


// Export utility functions for external use.
let EXPORTED_SYMBOLS = ['bindPref', 'bindPrefAndInit', 'getEnv', 'getLocale',
                        'loadScript', 'module', 'readfile', 'getProfileDir',
                        'getPrefValue', 'observe', 'showDialog'];