const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/SharedPromptUtils.jsm");

// Module specific constants
const kMODULE_NAME = "I2pbutton External App Handler";
const kCONTRACT_ID = "@geti2p.net/i2pbutton-extAppBlocker;1";
const kMODULE_CID = Components.ID("3da0269f-fc29-4e9e-a678-c3b1cafcf13f");

const kInterfaces = [Ci.nsIObserver, Ci.nsIClassInfo];

function ExternalAppBlocker() {
  this.logger = Cc["@geti2p.net/i2pbutton-logger;1"]
      .getService(Ci.nsISupports).wrappedJSObject;
  this.logger.log(3, "Component Load 0: New ExternalAppBlocker.");
}

ExternalAppBlocker.prototype =
{
  _helperAppLauncher: undefined,

  QueryInterface: XPCOMUtils.generateQI([Ci.nsISupports, Ci.nsIObserver,
                                         Ci.nsIHelperAppWarningDialog]),

  // make this an nsIClassInfo object
  flags: Ci.nsIClassInfo.DOM_OBJECT,
  classDescription: kMODULE_NAME,
  contractID: kCONTRACT_ID,
  classID: kMODULE_CID,

  // method of nsIClassInfo
  getInterfaces: function(count) {
    count.value = kInterfaces.length;
    return kInterfaces;
  },

  // method of nsIClassInfo
  getHelperForLanguage: function(count) { return null; },

  // method of nsIHelperAppWarningDialog
  maybeShow: function(aLauncher, aWindowContext)
  {
    // Hold a reference to the object that called this component. This is
    // important not just because we need to later invoke the
    // continueRequest() or cancelRequest() callback on aLauncher, but also
    // so that the launcher object (which is a reference counted object) is
    // not released too soon.
    this._helperAppLauncher = aLauncher;

    if (!Services.prefs.getBoolPref("extensions.i2pbutton.launch_warning")) {
      this._helperAppLauncher.continueRequest();
      return;
    }

    this._showPrompt(aWindowContext);
  },

  /*
   * The _showPrompt() implementation uses some XUL and JS that is part of the
   * browser's confirmEx() implementation. Specifically, _showPrompt() depends
   * on chrome://global/content/commonDialog.xul as well as some of the code
   * in resource://gre/modules/SharedPromptUtils.jsm.
   */
  _showPrompt: function(aWindowContext) {
    let parentWin;
    try {
      parentWin = aWindowContext.getInterface(Ci.nsIDOMWindow);
    } catch (e) {
      parentWin = Services.wm.getMostRecentWindow("navigator:browser");
    }

    let title = parentWin.i2pbutton_get_property_string("i2pbutton.popup.external.title");
    let app = parentWin.i2pbutton_get_property_string("i2pbutton.popup.external.app");
    let note = parentWin.i2pbutton_get_property_string("i2pbutton.popup.external.note");
    let suggest = parentWin.i2pbutton_get_property_string("i2pbutton.popup.external.suggest");
    let launch = parentWin.i2pbutton_get_property_string("i2pbutton.popup.launch");
    let cancel = parentWin.i2pbutton_get_property_string("i2pbutton.popup.cancel");
    let dontask = parentWin.i2pbutton_get_property_string("i2pbutton.popup.dontask");

    let args = {
      promptType:       "confirmEx",
      title:            title,
      text:             app+note+suggest+" ",
      checkLabel:       dontask,
      checked:          false,
      ok:               false,
      button0Label:     launch,
      button1Label:     cancel,
      defaultButtonNum: 1, // Cancel
      buttonNumClicked: 1, // Cancel
      enableDelay: true,
    };

    let propBag = PromptUtils.objectToPropBag(args);
    let uri = "chrome://global/content/commonDialog.xul";
    let promptWin = Services.ww.openWindow(parentWin, uri, "_blank",
                                    "centerscreen,chrome,titlebar", propBag);
    promptWin.addEventListener("load", aEvent => {
      promptWin.addEventListener("unload", aEvent => {
        PromptUtils.propBagToObject(propBag, args);

        if (0 == args.buttonNumClicked) {
          // Save the checkbox value and tell the browser's external helper app
          // module about the user's choice.
          if (args.checked) {
            Services.prefs.setBoolPref("extensions.i2pbutton.launch_warning",
                                       false);
          }

          this._helperAppLauncher.continueRequest();
        } else {
          this._helperAppLauncher.cancelRequest(Cr.NS_BINDING_ABORTED);
        }
      }, false);
    }, false);
  },
};

var NSGetFactory = XPCOMUtils.generateNSGetFactory([ExternalAppBlocker]);
