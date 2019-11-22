var {classes: Cc, interfaces: Ci, utils: Cu} = Components;


Cu.import("resource://gre/modules/Services.jsm");


var AboutI2pListener = {
  kAboutI2pLoadedMessage: "AboutI2p:Loaded",
  kAboutI2pChromeDataMessage: "AboutI2p:ChromeData",

  get isAboutI2p() {
    return content.document.documentURI.toLowerCase() == "about:i2p";
  },

  init: function(aChromeGlobal) {
    aChromeGlobal.addEventListener("AboutI2pLoad", this, false, true);
  },

  handleEvent: function(aEvent) {
    if (!this.isAboutI2p)
      return;

    switch (aEvent.type) {
      case "AboutI2pLoad":
        this.onPageLoad();
        break;
      case "pagehide":
        this.onPageHide();
        break;
    }
  },

  receiveMessage: function(aMessage) {
    if (!this.isAboutI2p)
      return;

    switch (aMessage.name) {
      case this.kAboutI2pChromeDataMessage:
        console.log(aMessage)
        this.onChromeDataUpdate(aMessage.data);
        break;
    }
  },

  onPageLoad: function() {
    // Arrange to update localized text and links.
    /*bindPrefAndInit("intl.locale.requested", aNewVal => {
      if (aNewVal !== null) {
        this.onLocaleChange(aNewVal);
      }
    });*/

    // Add message and event listeners.
    addMessageListener(this.kAboutI2pChromeDataMessage, this);
    addEventListener("pagehide", this, false);
    addEventListener("resize", this, false);

    sendAsyncMessage(this.kAboutI2pLoadedMessage);
  },

  onPageHide: function() {
    removeEventListener("resize", this, false);
    removeEventListener("pagehide", this, false);
    removeMessageListener(this.kAboutI2pChromeDataMessage, this);
  },

  onChromeDataUpdate: function(aData) {
    let body = content.document.body;

    if (aData.i2pOn) {
      body.setAttribute("i2pon", "yes")
    } else {
      body.removeAttribute("i2pon")
    }

    if (aData.i2pConsoleOn) {
      body.setAttribute("i2pconsoleon", "yes")
    } else {
      body.removeAttribute("i2pconsoleon")
    }

    if (aData.i2pProxyOn) {
      body.setAttribute("i2pproxyon", "yes")
    } else {
      body.removeAttribute("i2pproxyon")
    }

    if (aData.updateChannel)
      body.setAttribute("updatechannel", aData.updateChannel);
    else
      body.removeAttribute("updatechannel");

    if (aData.hasBeenUpdated) {
      body.setAttribute("hasbeenupdated", "yes");
      content.document.getElementById("update-infolink").setAttribute("href",
                                                      aData.updateMoreInfoURL);
    }

    if (aData.mobile)
      body.setAttribute("mobile", "yes");

    // Setting body.initialized="yes" displays the body.
    body.setAttribute("initialized", "yes");
  },

  onLocaleChange: function(aLocale) {

    // Display the I2P Browser product name and version.
    try {
      const kBrandBundle = "chrome://branding/locale/brand.properties";
      let brandBundle = Cc["@mozilla.org/intl/stringbundle;1"]
                          .getService(Ci.nsIStringBundleService)
                          .createBundle(kBrandBundle);
      let productName = brandBundle.GetStringFromName("brandFullName");
      let ibVersion = Services.prefs.getCharPref("i2pbrowser.version");
      let elem = content.document.getElementById("i2pbrowser-version");

      while (elem.firstChild)
        elem.removeChild(elem.firstChild);
      elem.appendChild(content.document.createTextNode(productName + ' '
                       + ibVersion));
    } catch (e) {}
  }
};

AboutI2pListener.init(this);
