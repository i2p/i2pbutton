// Module specific constants
const kMODULE_NAME = "about:i2p";
const kMODULE_CONTRACTID = "@mozilla.org/network/protocol/about;1?what=i2p";
const kMODULE_CID = Components.ID("84d47da6-79c3-4661-aa9f-8049476f7bf5");

const kAboutTorURL = "chrome://i2pbutton/content/aboutI2p/aboutI2p.xhtml";

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");

function AboutI2p()
{
}


AboutTor.prototype =
{
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIAboutModule]),

  // nsIClassInfo implementation:
  classDescription: kMODULE_NAME,
  classID: kMODULE_CID,
  contractID: kMODULE_CONTRACTID,

  // nsIAboutModule implementation:
  newChannel: function(aURI, aLoadInfo)
  {
    let ioSvc = Cc["@mozilla.org/network/io-service;1"]
                  .getService(Ci.nsIIOService);
    let uri = ioSvc.newURI(kAboutI2pURL, null, null);
    let channel = ioSvc.newChannelFromURIWithLoadInfo(uri, aLoadInfo);
    channel.originalURI = aURI;

    return channel;
  },

  getURIFlags: function(aURI)
  {
    return Ci.nsIAboutModule.URI_SAFE_FOR_UNTRUSTED_CONTENT |
           Ci.nsIAboutModule.URI_MUST_LOAD_IN_CHILD |
           Ci.nsIAboutModule.ALLOW_SCRIPT;
  }
};


let factory = XPCOMUtils._getFactory(AboutI2p);
let reg = Components.manager.QueryInterface(Ci.nsIComponentRegistrar);
reg.registerFactory(kMODULE_CID, "", kMODULE_CONTRACTID, factory);


