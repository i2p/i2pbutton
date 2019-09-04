// Module specific constants
const kMODULE_NAME = "I2pbutton I2P Check Service";
const kMODULE_CONTRACTID = "@geti2p.net/i2pbutton-i2pCheckService;1";
const kMODULE_CID = Components.ID("5d57312b-5d8c-4169-b4af-e80d6a28a72e");

const Cr = Components.results;
const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

function IBI2PCheckService() {
  this._logger = Cc["@geti2p.net/i2pbutton-logger;1"].getService(Ci.nsISupports).wrappedJSObject
  this._logger.info("I2pbutton I2P Check Service initialized")

  this._statusOfI2PCheck = this.kCheckNotInitiated
  this.wrappedJSObject = this
}

IBI2PCheckService.prototype =
{
  QueryInterface: function(iid) {
    if (!iid.equals(Ci.nsIClassInfo) &&
        !iid.equals(Ci.nsISupports)) {
      Components.returnCode = Cr.NS_ERROR_NO_INTERFACE;
      return null;
    }

    return this;
  },

  kCheckNotInitiated: 0, // Possible values for statusOfI2PCheck.
  kCheckSuccessful: 1,
  kCheckFailed: 2,
  kCheckOnlyConsole: 3,

  isConsoleWorking: false,
  isProxyWorking: false,

  wrappedJSObject: null,
  _logger: null,
  _statusOfI2PCheck: 0, // this.kCheckNotInitiated,

  // make this an nsIClassInfo object
  flags: Ci.nsIClassInfo.DOM_OBJECT,

  // method of nsIClassInfo
  classDescription: kMODULE_NAME,
  classID: kMODULE_CID,
  contractID: kMODULE_CONTRACTID,

  // method of nsIClassInfo
  getInterfaces: function(count) {
    var interfaceList = [Ci.nsIClassInfo];
    count.value = interfaceList.length;
    return interfaceList;
  },

  // method of nsIClassInfo
  getHelperForLanguage: function(count) { return null; },

  // Public methods.
  get statusOfI2PCheck()
  {
    return this._statusOfI2PCheck;
  },

  set statusOfI2PCheck(aStatus)
  {
    this._statusOfI2PCheck = aStatus;
  },

  init: function () {
    let self = this
    let req = this.createCheckConsoleRequest(true)
    req.onreadystatechange = function (event) {
      if (req.readyState === 4) {
        self.parseCheckConsoleResponse(req)
      }
    }
    req.send(null)
    let proxyReq = this.createCheckProxyRequest(true)
    proxyReq.onreadystatechange = function (event) {
      if (proxyReq.readyState === 4) {
        self.parseCheckProxyResponse(proxyReq)
      }
    }
    proxyReq.send(null)
  },

  _createRequest: function(url, aAsync, mimetype) {
    Cu.importGlobalProperties(["XMLHttpRequest"])
    let req = new XMLHttpRequest()
    req.open('GET', url, aAsync)
    req.channel.loadFlags |= Ci.nsIRequest.LOAD_BYPASS_CACHE
    req.overrideMimeType(mimetype)
    req.timeout = 120000 // Wait at most two minutes for a response.
    return req
  },

  createCheckConsoleRequest: function(aAsync)
  {
    let prefs =  Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefBranch)
    let port = prefs.getCharPref("network.i2p.console_port", 7657)
    let url = `http://localhost:${port}/netdb?r=.`
    return this._createRequest(url, aAsync, "text/html")
  },

  createCheckProxyRequest: function(aAsync) {
    let prefs =  Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefBranch)
    let url = prefs.getCharPref("extensions.i2pbutton.test_url")
    return this._createRequest(url, aAsync, "application/json")
  },

  parseCheckConsoleResponse: function(aReq)
  {
    let ret = 0;
    if(aReq.status == 200) {
      if(!aReq.response) {
        this._logger.log(5, "Check failed! Not text/html!")
        this._statusOfI2PCheck = this.kCheckFailed
        ret = 1;
      } else {
        if (aReq.response.indexOf('router.version') > 0) {
          // Console is up
          this._logger.log(3, "I2P Router Console is running.")
          this._statusOfI2PCheck = this.kCheckOnlyConsole
          this.isConsoleWorking = true
          ret = 4;
        }
      }
    } else {
      this._logger.log(5, "I2P test failed. HTTP Error: "+aReq.status);
      ret = 3;
      this._statusOfI2PCheck = this.kCheckFailed
    }
    return ret;
  },

  parseCheckProxyResponse: function(aReq)
  {
    let ret = 0;
    if(aReq.status == 200) {
      console.log(aReq)
        if(!aReq.response) {
            this._logger.log(5, "Check failed! Not text/html!")
            this._statusOfI2PCheck = this.kCheckFailed
            ret = 1;
        } else {
          try {
            let result = JSON.parse(aReq.response)
            this._logger.log(3, "Test Successful")
            this._statusOfI2PCheck = this.kCheckSuccessful
            this.isProxyWorking = true
            ret = 3;
          } catch (e) {
            this._logger.log(5, `Parsing failed due to: ${e}`)
            ret = 5;
            this._statusOfI2PCheck = this.kCheckFailed
          }
        }
      } else {
        if (0 == aReq.status) {
          try {
            var req = aReq.channel.QueryInterface(Ci.nsIRequest);
            if (req.status == Cr.NS_ERROR_PROXY_CONNECTION_REFUSED)
            {
              this._logger.log(5, "I2P test failed. Proxy connection refused");
              this._statusOfI2PCheck = this.kCheckFailed
              ret = 8;
            }
          } catch (e) {}
        }

        if (ret == 0)
        {
          this._logger.log(5, "I2P test failed. HTTP Error: "+aReq.status);
          this._statusOfI2PCheck = this.kCheckFailed
          ret = -aReq.status;
        }
      }

    return ret;
  }
};

Cu.import("resource://gre/modules/XPCOMUtils.jsm")
var NSGetFactory = XPCOMUtils.generateNSGetFactory([IBI2PCheckService])
