const oLogger = require("@ui5/logger").getLogger("ui5-nwabap-deployer-cli");
class Logger {    
    
    constructor () {
        this.errorStatus = false;
    }

    log(message) {
        oLogger.info(message);
    }

    error(message) {
        oLogger.error(message);
        this.errorStatus = true;
    }

    logVerbose(message) {
        oLogger.verbose(message);
    }

    getErrorStatus() {
        return this.errorStatus;
    }
}

module.exports = Logger;
