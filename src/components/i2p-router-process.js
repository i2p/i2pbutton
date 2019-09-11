// vim: set sw=2 sts=2 ts=8 et syntax=javascript:

const Cc = Components.classes
const Ci = Components.interfaces
const Cr = Components.results
const Cu = Components.utils

// ctypes can be disabled at build time
try { Cu.import("resource://gre/modules/ctypes.jsm") } catch(e) {}
Cu.import("resource://gre/modules/XPCOMUtils.jsm")

XPCOMUtils.defineLazyModuleGetter(this, "LauncherUtil", "resource://i2pbutton/modules/launcher-util.jsm")

//let observerService = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService)

function I2PProcessService()
{
  this._logger = Cc["@geti2p.net/i2pbutton-logger;1"].getService(Ci.nsISupports).wrappedJSObject
  this._config_checker = Cc["@geti2p.net/i2pbutton-router-config-mgr;1"].getService(Ci.nsISupports).wrappedJSObject
  this._logger.log(3, "I2pbutton I2P Router Process Service initialized")
  this.wrappedJSObject = this
}

I2PProcessService.prototype =
{
  kContractID : "@geti2p.net/i2pbutton-process-service;1",
  kServiceName : "I2P Launcher Process Service",
  kClassID: Components.ID("{f77babef-dead-b00b-beff-babe6c9afda7}"),
  kI2PLauncherExtPath: "i2pbutton@geti2p.net", // This could vary.

  kPrefPromptAtStartup: "extensions.i2pbutton.prompt_at_startup",

  kWizardProgressPageID: "progress",

  kInitialControlConnDelayMS: 25,
  kMaxControlConnRetryMS: 2000,     // Retry at least every 2 seconds.
  kControlConnTimeoutMS: 5*60*1000, // Wait at most 5 minutes for i2p to start.

  kStatusUnknown: 0, // I2P process status.
  kStatusStarting: 1,
  kStatusRunning: 2,
  kStatusExited: 3,  // Exited or failed to start.

  kI2PImplJava: "i2pj",
  kI2PImplCpp: "i2pd",

  kI2PProcessDidNotStartTopic: "I2PProcessDidNotStart",
  kI2PBootstrapErrorTopic: "I2PBootstrapError",

  // nsISupports implementation.
  QueryInterface: function(aIID)
  {
    if (!aIID.equals(Ci.nsISupports) &&
        !aIID.equals(Ci.nsIFactory) &&
        !aIID.equals(Ci.nsIObserver) &&
        !aIID.equals(Ci.nsIClassInfo))
    {
      throw Cr.NS_ERROR_NO_INTERFACE;
    }

    return this;
  },

  // nsIFactory implementation.
  createInstance: function(aOuter, aIID)
  {
    if (null != aOuter)
      throw Cr.NS_ERROR_NO_AGGREGATION;

    return this.QueryInterface(aIID);
  },

  init: function(aWindow) {},
  uninit: function unit() {},

  lockFactory: function(aDoLock) {},

  // nsIObserver implementation.
  observe: function(aSubject, aTopic, aParam)
  {
    const kUserQuitTopic = "I2PUserRequestedQuit"
    const kBootstrapStatusTopic = "I2PBootstrapStatus"

    if (!this.mObsSvc)
    {
      this.mObsSvc = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService)
    }

    if ("profile-after-change" == aTopic)
    {
      this.mObsSvc.addObserver(this, "quit-application-granted", false)
      this.mObsSvc.addObserver(this, kUserQuitTopic, false)
      this.mObsSvc.addObserver(this, kBootstrapStatusTopic, false)


      const self = this
      this._logger.log(3, 'Checking if a console is already up (an router already running)')
      this._isConsoleRunning(function(res) {
        if (res!=4) {
          // Yes, 4 is success
          let canStartPromise = self._config_checker.ensure_config()
          canStartPromise.then(() => {
            self._logger.log(3, 'Starting the router')
            self.I2PStartAndControlI2P(true)
          })
        } else {
          self._logger.log(3, 'Already found a router, won\'t launch.')
        }
      })
    }
    else if ("quit-application-granted" == aTopic)
    {
      this.mIsQuitting = true;
      this.mObsSvc.removeObserver(this, "quit-application-granted");
      this.mObsSvc.removeObserver(this, kUserQuitTopic);
      this.mObsSvc.removeObserver(this, kBootstrapStatusTopic);
      if (this.mI2PProcess)
      {
        let prefs =  Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefBranch)
        let shouldKillRouter = prefs.getBoolPref("extensions.i2pbutton.kill_router_on_exit", true)
        if (shouldKillRouter) this.mI2PProcess.kill()
        this._logger.log(4, "Disconnecting from i2p process (pid " + this.mI2PProcess.pid + ")");
        this.mI2PProcess = null;
      }
    }
    else if (("process-failed" == aTopic) || ("process-finished" == aTopic))
    {
      if (this.mControlConnTimer)
      {
        this.mControlConnTimer.cancel();
        this.mControlConnTimer = null;
      }

      this.mI2PProcess = null;
      this.mI2PProcessStatus = this.kStatusExited;
      this.mIsBootstrapDone = false;

      this.mObsSvc.notifyObservers(null, "I2PProcessExited", null);

      if (this.mIsQuitting)
      {
        LauncherUtil.cleanupTempDirectories();
      }
      else
      {
        var defaultBtnLabel = LauncherUtil.getLocalizedString("restart_i2p");
        var cancelBtnLabel = "OK";
        try
        {
          const kSysBundleURI = "chrome://global/locale/commonDialogs.properties";
          var sysBundle = Cc["@mozilla.org/intl/stringbundle;1"].getService(Ci.nsIStringBundleService).createBundle(kSysBundleURI);
          cancelBtnLabel = sysBundle.GetStringFromName(cancelBtnLabel);
        } catch(e) {}

        this._logger.log(3, 'The router stopped..')

        /*if (LauncherUtil.showConfirm(null, s, defaultBtnLabel, cancelBtnLabel) && !this.mIsQuitting)
        {
          this.I2PStartAndControlI2P(false);
        }*/
      }
    }
    else if ("timer-callback" == aTopic)
    {
      if (aSubject == this.mControlConnTimer)
      {
        this.mObsSvc.notifyObservers(null, "I2PProcessIsReady", null)
      }
    } else if (kBootstrapStatusTopic == aTopic) {
      //this._processBootstrapStatus(aSubject.wrappedJSObject);
    } else if (kUserQuitTopic == aTopic) {
      this.mQuitSoon = true;
    }
  },

  canUnload: function(aCompMgr) { return true; },

  // nsIClassInfo implementation.
  getInterfaces: function(aCount)
  {
    var iList = [ Ci.nsISupports,
                  Ci.nsIFactory,
                  Ci.nsIObserver,
                  Ci.nsIClassInfo ];
    aCount.value = iList.length;
    return iList;
  },

  getHelperForLanguage: function (aLanguage) { return null; },

  contractID: this.kContractID,
  classDescription: this.kServiceName,
  classID: this.kClassID,
  flags: Ci.nsIClassInfo.SINGLETON,

  classInfo : XPCOMUtils.generateCI({
    classID: this.kClassID,
    contractID: this.kContractID,
    classDescription: this.kServiceName,
    interfaces: [
      Ci.nsISupports,
      Ci.nsIFactory,
      Ci.nsIObserver,
      Ci.nsIClassInfo
    ],
    flags: Ci.nsIClassInfo.SINGLETON
  }),


  // Hack to get us registered early to observe recovery
  _xpcom_categories: [{category:"profile-after-change"}],


  // Public Properties and Methods ///////////////////////////////////////////
  get I2PProcessStatus()
  {
    return this.mI2PProcessStatus;
  },

  get I2PIsBootstrapDone()
  {
    return this.mIsBootstrapDone;
  },

  get I2PBootstrapErrorOccurred()
  {

  },

  getWrapperLog: function() {
    let wrapperLogFile = LauncherUtil.dataDirectoryObject
    wrapperLogFile.append('I2P')
    wrapperLogFile.append('wrapper.log')
    return this._getFileAsString(wrapperLogFile)
  },

  getLogsLogTxt: function() {
    let logTxtFile = LauncherUtil.dataDirectoryObject
    logTxtFile.append('I2P')
    logTxtFile.append('logs')
    logTxtFile.append('log-0.txt')
    return this._getFileAsString(logTxtFile)
  },

  retrieveBootstrapStatus: function() {},

  I2PStartAndControlI2P: function()
  {
    this._startI2P()
    let isRunningI2P = (this.mI2PProcessStatus == this.kStatusStarting) || (this.mI2PProcessStatus == this.kStatusRunning)
    this._controlI2P(isRunningI2P)
  },

  I2PClearBootstrapError: function()
  {
    this.mBootstrapErrorOccurred = false
    this.mLastI2PWarningPhase = null
    this.mLastI2PWarningReason = null
  },

  // Private Member Variables ////////////////////////////////////////////////
  mI2PProcessStatus: 0,  // kStatusUnknown
  mIsBootstrapDone: false,
  mBootstrapErrorOccurred: false,
  mIsQuitting: false,
  mObsSvc: null,
  mI2PUseImpl: this.kI2PImplJava,
  mI2PProcess: null,    // nsIProcess
  mI2PProcessStartTime: null, // JS Date.now()
  mControlConnTimer: null,
  mControlConnDelayMS: 0,
  mQuitSoon: false,     // Quit was requested by the user; do so soon.
  mLastI2PWarningPhase: null,
  mLastI2PWarningReason: null,
  mDefaultPreferencesAreLoaded: false,

  // Private Methods /////////////////////////////////////////////////////////

  _resetLogFiles: function() {
    let wrapperLogFile = LauncherUtil.dataDirectoryObject
    wrapperLogFile.append('I2P')
    wrapperLogFile.append('wrapper.log')
    if (wrapperLogFile.exists()) wrapperLogFile.remove(false)
    let logTxtFile = LauncherUtil.dataDirectoryObject
    logTxtFile.append('I2P')
    logTxtFile.append('logs')
    logTxtFile.append('log-0.txt')
    if (logTxtFile.exists()) logTxtFile.remove(false)
  },

  _startI2P: function()
  {
    this.mI2PProcessStatus = this.kStatusUnknown;

    // Avoid starting the router if extensions.i2pbutton.start_i2p is set to false.
    let prefs =  Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefBranch)
    let shouldStart = prefs.getBoolPref("extensions.i2pbutton.start_i2p")
    if (!shouldStart) return

    try
    {
      // Ideally, we would cd to the Firefox application directory before
      // starting i2p (but we don't know how to do that).  Instead, we
      // rely on the IBB launcher to start Firefox from the right place.

      // Get the I2P data directory first so it is created before we try to
      // construct paths to files that will be inside it.
      let dataDir = LauncherUtil.getI2PConfigPath(true)
      let exeFile = LauncherUtil.getI2PBinary()
      this._logger.log(3, `Datadir => ${dataDir.path}\nExeFile => ${exeFile.path}`)

      var detailsKey;
      if (!exeFile)
        detailsKey = "i2p_missing";
      else if (!dataDir)
        detailsKey = "datadir_missing";

      if (detailsKey)
      {
        var details = LauncherUtil.getLocalizedString(detailsKey);
        var key = "unable_to_start_i2p";
        var err = LauncherUtil.getFormattedLocalizedString(key, [details], 1);
        this._notifyUserOfError(err, null, this.kI2PProcessDidNotStartTopic);
        return;
      }

      this._resetLogFiles()

      let args = LauncherUtil.getRouterDefaultArgs()

      // Set an environment variable that points to the I2P data directory.
      let env = Cc["@mozilla.org/process/environment;1"].getService(Ci.nsIEnvironment)
      env.set("I2P_BROWSER_I2P_DATA_DIR", dataDir.path)

      // On Windows, prepend the I2P program directory to PATH.  This is
      // needed so that pluggable transports can find OpenSSL DLLs, etc.
      // See https://trac.torproject.org/projects/tor/ticket/10845
      if (LauncherUtil.isWindows)
      {
        var path = exeFile.parent.path
        if (env.exists("PATH"))
          path += ";" + env.get("PATH")
        env.set("PATH", path)
      }

      this.mI2PProcessStatus = this.kStatusStarting

      this._logger.log(3, `Trying to start with ${args}`)

      this._logger.log(2, "Starting " + exeFile.path)
      var p = Cc["@mozilla.org/process/util;1"].createInstance(Ci.nsIProcess)
      p.init(exeFile)

      for (var i = 0; i < args.length; ++i)
        this._logger.log(2, "  " + args[i])

      // Possible fix for Windows and cmd.exe window spawn.
      p.startHidden = true
      p.noShell = true

      p.runwAsync(args, args.length, this, false)
      this.mI2PProcess = p
      this.mI2PProcessStartTime = Date.now()
    }
    catch (e)
    {
      this.mI2PProcessStatus = this.kStatusExited
      //var s = LauncherUtil.getLocalizedString("i2p_failed_to_start");
      this._notifyUserOfError('Failed to start the I2P router', null, this.kI2PProcessDidNotStartTopic);
      this._logger.log(4, "_startI2P error: ", e)
    }
  }, // _startI2P()

  _isConsoleRunning: function(callback) {
    let checkSvc = Cc["@geti2p.net/i2pbutton-i2pCheckService;1"].getService(Ci.nsISupports).wrappedJSObject
    let obsSvc = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService)
    let req = checkSvc.createCheckConsoleRequest(true)
    const self = this
    req.onreadystatechange = function(event) {
      if (req.readyState === 4) {
        // Done
        let result = checkSvc.parseCheckConsoleResponse(req)
        self.mIsBootstrapDone = true
        self.mI2PProcessStatus = self.kStatusRunning
        var statusObj = { bootstrap: 'done', success: true }
        statusObj.wrappedJSObject = statusObj
        obsSvc.notifyObservers(statusObj, "I2PBootstrapStatus", null)
        callback(result)
      }
    }
    req.send(null)
  },

  _controlI2P: function(aIsRunningI2P)
  {

    try
    {
      if (aIsRunningI2P)
        this._monitorI2PProcessStartup();

      // If the user pressed "Quit" within settings/progress, exit.
      if (this.mQuitSoon)
        this._quitApp();
    }
    catch (e)
    {
      this.mI2PProcessStatus = this.kStatusExited;
      var s = LauncherUtil.getLocalizedString("i2p_control_failed");
      this._notifyUserOfError(s, null, null);
      this._logger.log(4, "_controlI2P error: ", e);
    }
  }, // controlI2P()

  _quitApp: function()
  {
    try
    {
      this.mQuitSoon = false;
      if (this.mI2PProcess != null) {
        this.mI2PProcess.kill()
      }

      let asSvc = Cc["@mozilla.org/toolkit/app-startup;1"].getService(Ci.nsIAppStartup);
      let flags = asSvc.eAttemptQuit;
      asSvc.quit(flags);
    }
    catch (e)
    {
      this._logger.log(4, "unable to quit", e);
    }
  },

  _monitorI2PProcessStartup: function()
  {
    this.mControlConnDelayMS = this.kInitialControlConnDelayMS
    this.mControlConnTimer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer)
    this.mControlConnTimer.init(this, this.mControlConnDelayMS, this.mControlConnTimer.TYPE_ONE_SHOT)
  },

  _notifyUserOfError: function(aMessage, aDetails, aNotifyTopic)
  {
    let errorObj = { handled: false, message: aMessage }
    if (aDetails)
      errorObj.details = aDetails

    if (aNotifyTopic)
    {
      // Give other code an opportunity to handle this error, e.g., if the
      // network settings window is open, errors are displayed using an
      // overlaid XUL element.
      errorObj.wrappedJSObject = errorObj
      this.mObsSvc.notifyObservers(errorObj, aNotifyTopic, null)
    }

    if (!errorObj.handled)
    {
      let msg = aMessage
      if (aDetails)
        msg += "\n\n" + aDetails
      I2PLauncherUtil.showAlert(null, msg)
    }
  },

  _getpid: function()
  {
    // Use nsIXULRuntime.processID if it is available.
    var pid = 0;

    try
    {
      var xreSvc = Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULRuntime);
      pid = xreSvc.processID;
    }
    catch (e)
    {
      this._logger.log(2, "failed to get process ID via XUL runtime:", e);
    }

    // Try libc.getpid() via js-ctypes.
    if (!pid) try
    {
      var getpid;
      if (LauncherUtil.isMac) {
        var libc = ctypes.open("libc.dylib")
        getpid = libc.declare("getpid", ctypes.default_abi, ctypes.uint32_t)
      } else if (LauncherUtil.isWindows) {
        var libc = ctypes.open("Kernel32.dll")
        getpid = libc.declare("GetCurrentProcessId", ctypes.default_abi, ctypes.uint32_t)
      } else {// Linux and others.
        var libc;
        try {
          libc = ctypes.open("libc.so.6")
        } catch(e) {
          libc = ctypes.open("libc.so")
        }

        getpid = libc.declare("getpid", ctypes.default_abi, ctypes.int)
      }

      pid = getpid()
    } catch(e) {
      this._logger.log(4, "unable to get process ID: ", e)
    }

    return pid;
  },

  // Returns undefined if file contents could not be read.
  _getFileAsString: function(aFile)
  {
    let str = ""
    let inStream;
    try
    {
      let fis = Cc['@mozilla.org/network/file-input-stream;1'].createInstance(Ci.nsIFileInputStream);
      const kOpenFlagsReadOnly = 0x01;
      fis.init(aFile, kOpenFlagsReadOnly, 0, 0);
      inStream = Cc["@mozilla.org/intl/converter-input-stream;1"].createInstance(Ci.nsIConverterInputStream);
      inStream.init(fis, "UTF-8", 0, Ci.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER);
      const kReadSize = 0xffffffff; // PR_UINT32_MAX
      while (true)
      {
        let outStr = {};
        let count = inStream.readString(kReadSize, outStr);
        if (count == 0)
          break;

        str += outStr.value;
      }
    }
    catch (e)
    {
      this._logger.log(5, "_getFileAsString " + aFile.path + "  error: " + e);
      str = undefined;
    }

    if (inStream)
      inStream.close();

    return str;
  },

  // After making a backup, replace the contents of aFile with aStr.
  // Returns true if successful.
  _overwriteFile: function(aFile, aStr)
  {
    let backupFile;

    try
    {
      // Convert the data to UTF-8.
      let conv = Cc["@mozilla.org/intl/scriptableunicodeconverter"].createInstance(Ci.nsIScriptableUnicodeConverter);
      conv.charset = "UTF-8";
      let data = conv.ConvertFromUnicode(aStr) + conv.Finish();

      // Rename the file to .bak (we avoid .orig because tor uses it). This
      // backup will be left on disk so the user can recover the original
      // file contents.
      backupFile = aFile.clone();
      backupFile.leafName += ".bak";
      backupFile.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, aFile.permissions);
      aFile.renameTo(null, backupFile.leafName);
      this._logger.log(3, "created backup of " + aFile.leafName + " in " + backupFile.leafName);

      // Write the new data to the file.
      let stream = Cc["@mozilla.org/network/safe-file-output-stream;1"].createInstance(Ci.nsIFileOutputStream);
      stream.init(aFile, 0x02 | 0x08 | 0x20, /* WRONLY CREATE TRUNCATE */
                  0o600, 0);
      stream.write(data, data.length);
      stream.QueryInterface(Ci.nsISafeOutputStream).finish();
    }
    catch (e)
    {
      // Report an error and try to recover by renaming the backup to the
      // original name.
      this._logger.log(5, "failed to overwrite file " + aFile.path + ": " + e);
      if (backupFile)
        backupFile.renameTo(null, aFile.leafName);

      return false;
    }

    return true;
  },

  endOfObject: true
}

let gI2PProcessService = new I2PProcessService


// TODO: Mark wants to research use of XPCOMUtils.generateNSGetFactory
// Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
function NSGetFactory(aClassID)
{
  if (!aClassID.equals(gI2PProcessService.kClassID))
    throw Cr.NS_ERROR_FACTORY_NOT_REGISTERED

  return gI2PProcessService
}


// This is the new stuff, stay away from generateNSGetModule which is the old stuff..
//var NSGetFactory = XPCOMUtils.generateNSGetFactory([I2PProcessService])
