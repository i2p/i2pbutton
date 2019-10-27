const Cc = Components.classes
const Ci = Components.interfaces
const Cu = Components.utils

const kI2PProcessExitedTopic = "I2PProcessExited"
const kBootstrapStatusTopic = "I2PBootstrapStatus"
const kI2PBootstrapErrorTopic = "I2PBootstrapError"
const kI2PLogHasWarnOrErrTopic = "I2PLogHasWarnOrErr"


Cu.import("resource://gre/modules/Services.jsm")
Cu.import("resource://gre/modules/XPCOMUtils.jsm")
XPCOMUtils.defineLazyModuleGetter(this, "LauncherUtil", "resource://i2pbutton/modules/launcher-util.jsm")


const I2PLauncherLogger = Cc["@geti2p.net/i2pbutton-logger;1"].getService(Ci.nsISupports).wrappedJSObject
const gI2PProcessService = Cc["@geti2p.net/i2pbutton-process-service;1"].getService(Ci.nsISupports).wrappedJSObject

var gObsSvc
var gOpenerCallbackFunc // Set when opened from network settings.


function initDialog()
{
  // If i2p bootstrap has already finished, just close the progress dialog.
  // This situation can occur if bootstrapping is very fast and/or if this
  // window opens s vlowly (observed with Adblock Plus installed).
  try
  {
    let processSvc = Cc["@geti2p.net/i2pbutton-process-service;1"].getService(Ci.nsISupports).wrappedJSObject
    if (processSvc.I2PIsBootstrapDone || processSvc.I2PBootstrapErrorOccurred)
    {
      closeThisWindow(processSvc.I2PIsBootstrapDone)
      return
    }
  }
  catch (e) { dump(e + "\n") }

  try
  {
    gObsSvc = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService)
    gObsSvc.addObserver(gObserver, kI2PProcessExitedTopic, false)
    gObsSvc.addObserver(gObserver, kBootstrapStatusTopic, false)
    gObsSvc.addObserver(gObserver, kI2PBootstrapErrorTopic, false)
    gObsSvc.addObserver(gObserver, kI2PLogHasWarnOrErrTopic, false)
  }
  catch (e) {}

  var isBrowserStartup = false
  if (window.arguments)
  {
    isBrowserStartup = window.arguments[0]

    if (window.arguments.length > 1)
      gOpenerCallbackFunc = window.arguments[1]
  }

  if (gOpenerCallbackFunc)
  {
    // Dialog was opened from network settings: hide Open Settings button.
    var extraBtn = document.documentElement.getButton("extra2")
    extraBtn.setAttribute("hidden", true)
  }
  else
  {
    // Dialog was not opened from network settings: change Cancel to Quit.
    var cancelBtn = document.documentElement.getButton("cancel")
    var quitKey = (LauncherUtil.isWindows) ? "quit_win" : "quit"
    cancelBtn.label = 'Cancel'//LauncherUtil.getLocalizedString(quitKey)
  }

  // If opened during browser startup, display the "please wait" message.
  if (isBrowserStartup)
  {
    var pleaseWait = document.getElementById("progressPleaseWait")
    if (pleaseWait)
      pleaseWait.removeAttribute("hidden")
  }
}


function cleanup()
{
  if (gObsSvc)
  {
    gObsSvc.removeObserver(gObserver, kI2PProcessExitedTopic)
    gObsSvc.removeObserver(gObserver, kBootstrapStatusTopic)
    gObsSvc.removeObserver(gObserver, kI2PBootstrapErrorTopic)
    gObsSvc.removeObserver(gObserver, kI2PLogHasWarnOrErrTopic)
  }
}

function onOpenSettings()
{
  //stopI2PBootstrap()
  //cleanup()
  window.close()
}


function stopI2PBootstrap()
{
  // Tell i2p to disable use of the network; this should stop the bootstrap
  // process.
  const kErrorPrefix = "Setting DisableNetwork=1 failed: ";
  try
  {
    var svc = Cc["@torproject.org/torlauncher-protocol-service;1"]
                 .getService(Ci.nsISupports);
    svc = svc.wrappedJSObject;
    var settings = {};
    settings["DisableNetwork"] = true;
    var errObj = {};
    if (!svc.I2PSetConfWithReply(settings, errObj))
    I2PLauncherLogger.log(5, kErrorPrefix + errObj.details);
  }
  catch(e)
  {
    I2PLauncherLogger.log(5, kErrorPrefix + e);
  }
}

// Fake it for now. The main goal is to could say with more confidence that
// the router has had time to start before the user can start using the browser
// as any other browser.
let consolePort = Services.prefs.getIntPref("extensions.i2pbutton.console_port_i2pj", 7647)

LauncherUtil.waitForPortToOpen(consolePort, () => {
  var meter = document.getElementById("progressMeter")
  if (meter) {
    meter.value = meter.value + 30
  }
  setTimeout(() => {
    window.close()
  }, 5000)
})





var gObserver = {
  // nsIObserver implementation.
  observe: function(aSubject, aTopic, aParam)
  {
    if ((kI2PProcessExitedTopic == aTopic) ||
        (kI2PBootstrapErrorTopic == aTopic))
    {
      // In these cases, an error alert will be displayed elsewhere so it is
      // best to close this window.
      // TODO: provide a way to access tor log e.g., leave this dialog open
      //       and display the open settings button or provide a way to do
      //       that from our error alerts.
      if (kI2PBootstrapErrorTopic == aTopic)
        stopI2PBootstrap();
      cleanup();
      window.close();
    }
    else if (kBootstrapStatusTopic == aTopic)
    {
      var statusObj = aSubject.wrappedJSObject
      var labelText = LauncherUtil.getLocalizedBootstrapStatus(statusObj, "TAG")
      var percentComplete = (statusObj.PROGRESS) ? statusObj.PROGRESS : 0

      var meter = document.getElementById("progressMeter")
      if (meter)
        meter.value = percentComplete

      var bootstrapDidComplete = (percentComplete >= 100)
      if (percentComplete >= 100)
      {
        // To ensure that 100% progress is displayed, wait a short while
        // before closing this window.
        window.setTimeout(function() { closeThisWindow(true) }, 250)
      }
      else if (statusObj._errorOccurred)
      {
        var s = LauncherUtil.getLocalizedBootstrapStatus(statusObj, "REASON");
        if (s)
          labelText = s;

        if (meter)
          meter.setAttribute("hidden", true);

        var pleaseWait = document.getElementById("progressPleaseWait");
        if (pleaseWait)
          pleaseWait.setAttribute("hidden", true);
      }

      var desc = document.getElementById("progressDesc");
      if (labelText && desc)
        desc.textContent = labelText;
    }
    else if (kI2PLogHasWarnOrErrTopic == aTopic)
    {
      var extra2Btn = document.documentElement.getButton("extra2");
      var clz = extra2Btn.getAttribute("class");
      extra2Btn.setAttribute("class", clz ? clz + " i2pWarning" : "i2pWarning");

      // TODO: show error / warning message in this dialog?
    }
  },
}


