"use strict";

const util = require("util");
const fsutil = require("./FileStoreUtil");
const CTS_BASE_URL = "/sap/bc/adt/cts/transports";
const CTS_QUERY_URL = "/sap/bc/adt/cts/transportrequests";
const REQ_PGMID_WAPP = "LIMU";
const REQ_TYPE_WAPP = "WAPP";
const REQ_PGMID_WAPA = "R3TR";
const REQ_TYPE_WAPA = "WAPA";
const AdtClient = require("./AdtClient");
const XMLDocument = require("xmldoc").XmlDocument;

/**
 * creates and releases transport requests
 * @param {object}  oOptions
 * @param {object}  oOptions.conn               connection info
 * @param {string}  oOptions.conn.server        server url
 * @param {string}  oOptions.conn.client        sap client id
 * @param {boolean} oOptions.conn.useStrictSSL  force encrypted connection
 * @param {string}  oOptions.conn.proxy         set connection proxy
 * @param {string}  oOptions.auth.user          username
 * @param {string}  oOptions.auth.pwd           password
 * @param {Logger}  oLogger
 * @constructor
 */
function TransportManager(oOptions, oLogger) {
    this._client = new AdtClient(oOptions.conn, oOptions.auth, undefined, oLogger);
    this._oLogger = oLogger;
}
TransportManager.prototype.createTransport = function(sPackageName, sRequestText, sUsername, sBSPContainer, fnCallback) {

    //fnCallback(null, 'AGFK900069');    
    let sTransportNo = "";
    const sTransportQueryUrl = this._client.buildTransportQueryUrl(CTS_QUERY_URL, sUsername);    
    this._client.determineCSRFToken(function() {
        const oRequestOptions = {
            method: "GET",
            url: sTransportQueryUrl,
            headers: {
                "accept": "*/*"
            }
        };   
        this._client.sendRequest(oRequestOptions, function(oError, oResponse) {
            if (oError) {
                fnCallback(new Error(fsutil.createResponseError(oError)));
                return;
            } else if (oResponse.statusCode !== fsutil.HTTPSTAT.ok) {
                fnCallback(new Error(`Operation Query Transport: Expected status code ${fsutil.HTTPSTAT.ok}, actual status code ${oResponse.statusCode}`));
                return;
            } else {
                if (!oResponse.body) {
                    return fnCallback(new Error(`Operation Query Transport: Response Body doesn't exist!`));
                }
                const oParsed = new XMLDocument(oResponse.body);
                const oWorkbench = oParsed.childNamed("tm:workbench");                
                const oTargets = oWorkbench.childrenNamed("tm:target");
                oTargets.some(target => {
                    const oModifiable = target.childNamed("tm:modifiable");
                    const oRequests = oModifiable.childrenNamed("tm:request");
                    oRequests.some(request => {                        
                        var sRequestNumber = request.attr["tm:number"];
                        request.eachChild((child,index,array) => {
                            if (child.name==="tm:abap_object") {
                                if (
                                        (child.attr["tm:pgmid"] === REQ_PGMID_WAPP && child.attr["tm:type"] === REQ_TYPE_WAPP && child.attr["tm:name"].toUpperCase().startsWith(sBSPContainer.toUpperCase())) ||
                                        (child.attr["tm:pgmid"] === REQ_PGMID_WAPA && child.attr["tm:type"] === REQ_TYPE_WAPA && child.attr["tm:name"].toUpperCase() === sBSPContainer.toUpperCase()) 
                                    ) {
                                    sTransportNo = sRequestNumber;                                    
                                }        
                            } else if (child.name==="tm:task") {
                                child.eachChild((taskChild,taskIndex,taskArray) => {                                    
                                    if (taskChild.name==="tm:abap_object") {
                                        if (
                                                (taskChild.attr["tm:pgmid"] === REQ_PGMID_WAPP && taskChild.attr["tm:type"] === REQ_TYPE_WAPP && taskChild.attr["tm:name"].toUpperCase().startsWith(sBSPContainer.toUpperCase())) ||
                                                (taskChild.attr["tm:pgmid"] === REQ_PGMID_WAPA && taskChild.attr["tm:type"] === REQ_TYPE_WAPA && taskChild.attr["tm:name"].toUpperCase() === sBSPContainer.toUpperCase()) 
                                            ) {
                                            sTransportNo = sRequestNumber;
                                        }        
                                    }
                                });
                            }                                                        
                        });
                        if (sTransportNo !== "") {
                            this._oLogger.log("Found object in transport:"+sRequestNumber);
                            return true;
                        }
                    });
                });
                
                if (sTransportNo !== "") {                    
                    fnCallback(null, sTransportNo);  
                } else {
                    this.createTransportAfterCheck(sPackageName, sRequestText, sUsername, sBSPContainer, fnCallback);
                }                              
                return;
                }
        }.bind(this));            

    }.bind(this));   
}; 
TransportManager.prototype.createTransportAfterCheck = function(sPackageName, sRequestText, sUsername, sBSPContainer, fnCallback) {
    const sPayload = this.getCreateTransportPayload(sPackageName, sRequestText);

    const sUrl = this._client.buildUrl(CTS_BASE_URL);

    this._client.determineCSRFToken(function() {
        const oRequestOptions = {
            method: "POST",
            url: sUrl,
            headers: {
                "accept": "*/*"
            },
            body: sPayload
        };

        this._client.sendRequest(oRequestOptions, function(oError, oResponse) {
            if (oError) {
                fnCallback(new Error(fsutil.createResponseError(oError)));
                return;
            } else if (oResponse.statusCode !== fsutil.HTTPSTAT.ok) {
                fnCallback(new Error(`Operation Create Transport: Expected status code ${fsutil.HTTPSTAT.ok}, actual status code ${oResponse.statusCode}`));
                return;
            } else {
                const sTransportNo = oResponse.body.split("/").pop();
                this._oLogger.log("Creation of transport request required. Number of created transport request: " + sTransportNo);
                fnCallback(null, sTransportNo);
                return;
            }
        }.bind(this));
    }.bind(this));
}

/**
 * Determines if a transport with the given text already exists. If true the callback returns the transport no
 * otherwise the cb returns null.
 * @param {Function} fnCallback
 */
TransportManager.prototype.determineExistingTransport = function(fnCallback) {
    const sUrl = this._client.buildUrl(CTS_BASE_URL + "?_action=FIND&trfunction=K");

    const oRequestOptions = {
        url: sUrl,
        headers: {
            "accept": "*/*"
        }
    };

    this._client.sendRequest(oRequestOptions, function(oError, oResponse) {
        if (oError) {
            fnCallback(new Error(fsutil.createResponseError(oError)));
            return;
        } else if (oResponse.statusCode !== fsutil.HTTPSTAT.ok) {
            fnCallback(new Error(`Operation Existing Transport Determination: Expected status code ${fsutil.HTTPSTAT.ok}, actual status code ${oResponse.statusCode}`));
            return;
        } else {
            if (!oResponse.body) {
                return fnCallback(null, null);
            }
            const oParsed = new XMLDocument(oResponse.body);
            const transportNo = oParsed.valueWithPath("asx:values.DATA.CTS_REQ_HEADER.TRKORR");
            fnCallback(null, transportNo);
            return;
        }
    });
};

TransportManager.prototype.getCreateTransportPayload = function(sPackageName, sRequestText) {
    const sTemplate = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>" +
        "<asx:abap xmlns:asx=\"http://www.sap.com/abapxml\" version=\"1.0\">" +
        "<asx:values>" +
        "<DATA>" +
        "<OPERATION>I</OPERATION>" +
        "<DEVCLASS>%s</DEVCLASS>" +
        "<REQUEST_TEXT>%s</REQUEST_TEXT>" +
        "</DATA>" +
        "</asx:values>" +
        "</asx:abap>";

    return util.format(sTemplate, sPackageName, sRequestText);
};

module.exports = TransportManager;
