/*************************************************************************
 * Drag and Drop Handler.
 *
 * Implements an observer that filters drag events to prevent OS
 * access to URLs (a potential proxy bypass vector).
 *************************************************************************/
const { XPCOMUtils } = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");
const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");


// Module specific constants
const kMODULE_NAME = "I2pbutton Drag and Drop Handler";
const kCONTRACT_ID = "@geti2p.net/i2pbutton-dragDropFilter;1";
const kMODULE_CID = Components.ID("f605ec27-d867-44b5-ad97-2a29276642c3");

const kInterfaces = [Ci.nsIObserver, Ci.nsIClassInfo];

function DragDropFilter() {
  this.logger = Cc["@torproject.org/torbutton-logger;1"]
      .getService(Ci.nsISupports).wrappedJSObject;
  this.logger.log(3, "Component Load 0: New DragDropFilter.");

  try {
    Services.obs.addObserver(this, "on-datatransfer-available");
  } catch (e) {
    this.logger.log(5, "Failed to register drag observer");
  }
}

DragDropFilter.prototype =
{
  QueryInterface: ChromeUtils.generateQI([Ci.nsIObserver]),

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

  // method of nsIObserver
  observe: function(subject, topic, data) {
    if (topic == "on-datatransfer-available") {
      this.logger.log(3, "The DataTransfer is available");
      return this.filterDataTransferURLs(subject);
    }
  },

  filterDataTransferURLs: function(aDataTransfer) {
    var types = null;
    var type = "";
    var count = aDataTransfer.mozItemCount;
    var len = 0;
    for (var i = 0; i < count; ++i) {
      this.logger.log(3, "Inspecting the data transfer: " + i);
      types = aDataTransfer.mozTypesAt(i);
      len = types.length;
      for (var j = 0; j < len; ++j) {
        type = types[j];
        this.logger.log(3, "Type is: " + type);
        if (type == "text/x-moz-url" ||
            type == "text/x-moz-url-data" ||
            type == "text/uri-list" ||
            type == "application/x-moz-file-promise-url") {
          aDataTransfer.clearData(type);
          this.logger.log(3, "Removing " + type);
        }
      }
    }
  }
};

var NSGetFactory = XPCOMUtils.generateNSGetFactory([DragDropFilter]);


