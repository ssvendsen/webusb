/**
 * Created by M43999 on 26.09.2016.
 */

const atmelVendorId = 0x03eb;
const edbgConfigurationValue = 1;
const cmsisInterfaceNumber = 0;
// edbg
//const outEndpoint = 1;
//const inEndpoint = 2;
// medbg
const outEndpoint = 2;
const inEndpoint = 1;

class CmsisDevice {
    constructor(vendorId) {
        this.vendorId = vendorId;
        this.device = undefined;
        this.inEndpointSize = undefined;
        this.outEndpointSize = undefined;
    }

    get id() {
        if (this.device && this.device.opened)
            return this.device.productName + " " + this.device.serialNumber;
        else
            return undefined;
    }
    get outEndpointPacketSize() { return this.outEndpointSize; }
    get inEndpointPacketSize() { return this.inEndpointSize; }

    selectAndConnect() {
        return navigator.usb.requestDevice({filters: [{vendorId: this.vendorId}]}).then(selectedDevice => {
            this.device = selectedDevice;
            return this.device.open(); // Begin a session.
        }).then(() => {
            // observations:
            // on windows, configuration can be preselected and re-selecting the same configuration causes a soft reset (?)
            // on android, configuration can be null, so we can't just check what the active configuration is
            if (!this.device.configuration || this.device.configuration.configurationValue != edbgConfigurationValue)
                return this.device.selectConfiguration(edbgConfigurationValue);
            else
                return Promise.resolve();
        }).then(() => {
            return this.device.claimInterface(cmsisInterfaceNumber);
        }).then(() => {
            var interfaceAlt = this.device.configuration.interfaces[cmsisInterfaceNumber].alternate;
            this.inEndpointSize = interfaceAlt.endpoints[1].packetSize;
            this.outEndpointSize = interfaceAlt.endpoints[0].packetSize;
            return Promise.resolve();
        }).catch(error => {
            console.log(error);
            return Promise.reject(error);
        });
    }

    sendCommand(command) {
        var reportData = new Uint8Array(this.outEndpointPacketSize);
        reportData.set(command.slice(0, this.outEndpointPacketSize));

        return this.device.transferOut(outEndpoint, reportData).then(() => {
            return this.device.transferIn(inEndpoint, this.inEndpointPacketSize);
        }).then((result) => {
            return Promise.resolve(new Uint8Array(result.data.buffer));
        }).catch(error => {
            return Promise.reject(error);
        });
    }

}

