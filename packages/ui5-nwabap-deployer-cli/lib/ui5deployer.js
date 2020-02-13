"use strict";
const ui5Fs = require("@ui5/fs");
const Logger = require("./Logger");
const ui5DeployerCore = require("ui5-nwabap-deployer-core");
require("dotenv").config();
const oLogger = new Logger();
const oDeployOptions = {
    conn: {
    },
    auth: { 
    },
    ui5: {
    }
};

const processConfigurationVariables = (args) => {
    const processVariable = (configObject,configVariable,environmentVariable,isOptional,defaultValue) => {        
        args.forEach((val, index, array) => {
            let arg = val.split("=");
            if (arg.length === 2 && arg[0]===configVariable) {
                configObject[configVariable] = arg[1];
            }
        });            
        if (!configObject[configVariable]) {
            if (process.env[environmentVariable]) {
                configObject[configVariable] = process.env[environmentVariable];
            } else {                
                if (!isOptional) {
                    oLogger.error(configVariable + " parameter is not provided neither in arguments nor environment varialbes!");
                } else {
                    let additionalLogMessage = "";
                    if (defaultValue) {
                        configObject[configVariable] = defaultValue;
                        additionalLogMessage = " Default value is set to:"+defaultValue;
                    }
                    oLogger.log(configVariable + " parameter is not provided."+additionalLogMessage);                    
                }
            }
        }
    }
    const processBooleanVariable = (configObject,configVariable,environmentVariable,isOptional,defaultValue) => {     
        processVariable(configObject,configVariable,environmentVariable,isOptional,defaultValue);
        if (configObject[configVariable]) {
            configObject[configVariable] = !!configObject[configVariable];
        }
    }
    processVariable(oDeployOptions.conn,"server","UI5_NWABAP_DEPLOYER__SERVER",false);
    processVariable(oDeployOptions.conn,"client","UI5_NWABAP_DEPLOYER__CLIENT",false);
    processVariable(oDeployOptions.auth,"user","UI5_NWABAP_DEPLOYER__USER",false);
    processVariable(oDeployOptions.auth,"pwd","UI5_NWABAP_DEPLOYER__PASSWORD",false);
    processVariable(oDeployOptions.ui5,"language","UI5_NWABAP_DEPLOYER__LANGUAGE",true,"EN");
    processVariable(oDeployOptions.ui5,"transportno","UI5_TASK_NWABAP_DEPLOYER__TRANSPORTNO",true);
    processVariable(oDeployOptions.ui5,"package","UI5_NWABAP_DEPLOYER__PACKAGE");
    processVariable(oDeployOptions.ui5,"bspcontainer","UI5_NWABAP_DEPLOYER__BSPCONTAINER");
    processVariable(oDeployOptions.ui5,"bspcontainer_text","UI5_NWABAP_DEPLOYER__BSPCONTAINER_TEXT");
    processBooleanVariable(oDeployOptions.ui5,"create_transport","UI5_NWABAP_DEPLOYER__CREATE_TRANSPORT",true);
    processVariable(oDeployOptions.ui5,"transport_text","UI5_NWABAP_DEPLOYER__TRANSPORT_TEXT",true,oDeployOptions.ui5.bspcontainer);
    processBooleanVariable(oDeployOptions.ui5,"transport_use_user_match","UI5_NWABAP_DEPLOYER__TRANSPORT_USE_USER_MATCH",true);
    processBooleanVariable(oDeployOptions.ui5,"transport_use_locked","UI5_NWABAP_DEPLOYER__TRANSPORT_USE_LOCKED",true);
    processBooleanVariable(oDeployOptions.ui5,"calc_appindex","UI5_NWABAP_DEPLOYER__CALC_APPINDEX",true);
    processVariable(oDeployOptions.ui5,"packages_path","UI5_NWABAP_DEPLOYER__PACKAGES_PATH");

}

let args = process.argv.slice(2);

processConfigurationVariables(args);

if (oLogger.getErrorStatus()) {
    oLogger.error("Please provide all configuration parameters!");
    return;
} else {
    oLogger.log("Configuration paramters loaded successfully. Deployment starting...");
    oLogger.log("Deploying files in " + oDeployOptions.ui5.packages_path);
}
/*
const xoDeployOptions = {
    conn: {
        server: 'http://10.1.8.137:8000',
        client: '001'
    },
    auth: { 
        user: 'XAG',
        pwd: 'Mahmut06'
    },
    ui5: {
        language: 'TR',
        //transportno: sTransportNo,
        package: 'ZFIORI',
        bspcontainer: 'ZAG_DEPLOY_TST',
        bspcontainer_text: 'Deployment Test App',
        create_transport: true,
        transport_text: 'Deployment Test Transport',
        transport_use_user_match: true,
        transport_use_locked: true,
        calc_appindex: true
    }
};
*/
const sResourcePattern = "**/*.*";
const resourceFactory = ui5Fs.resourceFactory;
const DuplexCollection = ui5Fs.DuplexCollection;

try {    
	const reader = resourceFactory.createAdapter({
        fsBasePath: oDeployOptions.ui5.packages_path,
		virBasePath: "/"        
	});
	const writer = resourceFactory.createAdapter({
        fsBasePath: oDeployOptions.ui5.packages_path,
		virBasePath: "/"
    });
    const workspace = new DuplexCollection({reader,writer});
    return workspace.byGlob(sResourcePattern).then((resources) => {
        return Promise.all(resources.map(async (resource) => {
            // if (options.projectNamespace) {
            //     resource.setPath(resource.getPath().replace(
            //         new RegExp(`^/resources/${options.projectNamespace}`), ""));
            // }
            return {
              path: resource.getPath(),
              content: await resource.getBuffer()
            };
        }));
    }).then(async (aFiles) => {   
        if (aFiles.length==0) {
            oLogger.error("Packages path is not valid. Please provide correct path!")
        } else {
            ui5DeployerCore.deployUI5toNWABAP(oDeployOptions,aFiles,oLogger);
        }        
    }).then(() => {
        return Promise.resolve();
    });    
} catch (oError) {
    oLogger.error(oError);
}    