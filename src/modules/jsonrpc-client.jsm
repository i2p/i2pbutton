const EXPORTED_SYMBOLS = ['JsonPrcClient']
// vim: set sw=2 sts=2 ts=8 et syntax=javascript:

const Cc = Components.classes
const Ci = Components.interfaces
const Cr = Components.results
const Cu = Components.utils

Cu.import("resource://gre/modules/Services.jsm")
Cu.import("resource://gre/modules/XPCOMUtils.jsm")
Cu.import("resource://gre/modules/Log.jsm")
Cu.import("resource://i2pbutton/modules/http.jsm")

Cu.importGlobalProperties(["XMLHttpRequest"])

var log = Log.repository.getLogger("i2pbutton.jsonrpc-client")
log.level = Log.Level.Debug
// A console appender logs to the browser console.
log.addAppender(new Log.ConsoleAppender(new Log.BasicFormatter()))

class JsonRpcClient {
  constructor(url) {
    this.serverUrl = url
    this.mReqIdSequence = 0
    this.responses = new Array()
    this.token = ''
  }

  _createTemplateData(method, params, id) {
    this.mReqIdSequence++
    return JSON.stringify({
      'id': id || this.mReqIdSequence,
      'method': method,
      'params': params || {},
      'jsonrpc': '2.0'
    })
  }

  _onload(method, callback) {
    const self = this
    return () => {
      console.log('done', method)
      switch (method) {
        case 'Authenticate':
          let jData = JSON.parse(self.xhr.response)
          let token = jData.result.Token
          self.token = token
          break
        case 'RouterManager':
          break
        default:
          console.log('Unknown method')
      }
      if('function' === typeof callback) {
        callback(self.xhr)
      }
      self.responses.push(self.xhr.response)
      console.log(self.xhr.responseText)
    }
  }

  makeRequest(method, params, callback) {
    this.xhr = new XMLHttpRequest()
    this.xhr.open('POST', this.serverUrl)
    let data = this._createTemplateData(method, params)
    this.xhr.onload = this._onload(method, callback)
    this.xhr.setRequestHeader('Content-Length', `${data.length}`)
    this.xhr.setRequestHeader('Content-Type', 'application/json')
    this.xhr.send(data)
  }
}

class I2PControlClient extends JsonRpcClient {
  constructor() {
    super('http://127.0.0.1:7647/jsonrpc/')
  }

  authenticate(password, callback) {
    this.makeRequest('Authenticate', {'API':1, 'Password':password}, callback)
  }

  shutdownRouter(callback) {
    this.makeRequest('RouterManager', {'API':1,'Token':this.token, 'Shutdown': true}, callback)
  }

  reseedRouter(callback) {
    this.makeRequest('RouterManager', {'API':1,'Token':this.token, 'Reseed': true}, callback)
  }

  restartRouter(callback) {
    this.makeRequest('RouterManager', {'API':1,'Token':this.token, 'Restart': true}, callback)
  }
}
