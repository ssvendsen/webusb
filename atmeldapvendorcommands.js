/**
 * Created by M43999 on 29.09.2016.
 */


/** This interface represents the Atmel-specific CMSIS DAP extension commands.
A subset of the commands (AVR_CMD, AVR_RSP and AVR_EVT) are used to transport
"native" commands over the CMSIS stack. */
/*
export class IDapProtocolExt
{
public:
    virtual ~IDapProtocolExt(){}

    virtual bool sendAvrCommand(Packet::const_iterator it, uint16_t packetSize, uint8_t packetIndex, uint8_t numPackets, uint16_t timeout) const = 0;
    virtual bool receiveAvrResponse(Packet::iterator it, uint16_t *packetSize, uint8_t *packetIndex, uint8_t *numPackets, uint16_t timeout) const = 0;
    virtual bool receiveAvrEvent(Packet::iterator it, uint16_t *packetSize) const = 0;
    virtual bool enterUpgradeMode() = 0;
    // TODO: AVR Custom Erase Pin command
};
*/


const CMSISDAPEXT_PROTOCOL_TIMEOUT = 5000;

const DAP_EXT_AVR_CMD = 0x80;
const DAP_EXT_AVR_RSP = 0x81;
const DAP_EXT_AVR_EVT = 0x82;
const DAP_EXT_AVR_BOOT = 0x9f;

const DAP_OK = 0x00;
const DAP_ERROR = 0xFF;

const DAP_EXT_CMD_GIVE_ME_MORE = 0x00;
const DAP_EXT_CMD_EXECUTING = 0x01;

const MAX_TRANSPORTED_MESSAGESIZE = 0x10000;


//////////////

const _ID_DAP_Info = 0x00;
const _DAP_ID_PACKET_SIZE = 0xFF;
const DEFAULT_HID_REPORT_SIZE = 64;
const HID_HEADER_SIZE = 2; // What is this??
const AVR_CMD_HEADER_SIZE = 4;


class AtmelDapProtocolVendorCommands
{
    constructor(transport)
    {
        this.transport = transport;
        //this.maxPacketSize = -1;
    }

    get maxAvrCommandDataSize()
    {
        return this.transport.outEndpointPacketSize - AVR_CMD_HEADER_SIZE - HID_HEADER_SIZE;
    }

    sendAvrCommand(data, packetIndex, numPackets)
    {
        // omitted: flushing input queue

        // omitted: check that data fits into packet

        var fragmentInfo = (packetIndex << 4) + numPackets;
        var dataSize = data.byteLength;

        var command = new Uint8Array(AVR_CMD_HEADER_SIZE + dataSize);
        command[0] = DAP_EXT_AVR_CMD;
        command[1] = fragmentInfo;
        command[2] = (dataSize >> 8) & 0xff;
        command[3] = (dataSize >> 0) & 0xff;
        command.set(data, AVR_CMD_HEADER_SIZE);

        return this.transport.sendCommand(command).then((response) => {

            // Response format
            // ----- CMSIS Header
            // [0] AVR_CMD
            // [1] Fragment code
            const RESPONSE_HEADER_SIZE = 2;

            if (response.byteLength < RESPONSE_HEADER_SIZE)
                throw "Short response received on sending AVR_CMD";

            var id = response[0];
            if (id != DAP_EXT_AVR_CMD)
                throw "Unexpected response received on sending AVR_CMD";

            var fragmentCode = response[1];
            if (fragmentCode != DAP_EXT_CMD_EXECUTING && fragmentCode != DAP_EXT_CMD_GIVE_ME_MORE)
                throw "Unexpected fragment code in response on sending AVR_CMD";

            return Promise.resolve();
        });
    }

    receiveAvrResponse()
    {
        var command = new Uint8Array(1);
        command[0] = DAP_EXT_AVR_RSP;

        return this.transport.sendCommand(command).then((response) => {

            // Response format
            // ----- CMSIS Header
            // [0] AVR_RSP
            // [1] Fragment info
            // [2] JTAGICE3 response size (high byte)
            // [3] JTAGICE3 response size (low byte)
            // ----- Payload
            // [4] ...
            const RESPONSE_HEADER_SIZE = 4;

            if (response.byteLength < RESPONSE_HEADER_SIZE)
                throw "Short response received on sending AVR_RSP";

            if (response[0] != DAP_EXT_AVR_RSP)
                throw "Invalid response received on sending AVR_RSP";

            var fragmentInfo = response[1];
            var dataSize = response[2] << 8 | response[3];

            if (response.byteLength < RESPONSE_HEADER_SIZE + dataSize)
                throw "Malformed response received on sending AVR_RSP";

            var result = {};
            result.packetIndex = fragmentInfo >> 4;
            result.numPackets = fragmentInfo & 0x0F;
            result.data = new Uint8Array(response, RESPONSE_HEADER_SIZE, dataSize);
            return Promise.resolve(result);
        });
    }

    receiveAvrEvent()
    {
        var command = new Uint8Array(1);
        command[0] = DAP_EXT_AVR_EVT;

        var response = this.transport.sendCommand(command);

        // Response format
        // ----- CMSIS Header
        // [0] AVR_EVT
        // [1] JTAGICE3 Event Size (high byte)
        // [2] JTAGICE3 Event Size (low byte)
        // ----- Payload
        // [3] ...
        const RESPONSE_HEADER_SIZE = 3;

        if (response.byteLength < RESPONSE_HEADER_SIZE)
            throw "Short response received on sending AVR_EVT";

        if (response[0] != DAP_EXT_AVR_RSP)
            throw "Invalid response received on sending AVR_EVT";

        var dataSize = (response[1] << 8) | response[2];

        if (response.byteLength < RESPONSE_HEADER_SIZE + dataSize)
            throw "Malformed response received on sending AVR_EVT";

        var result = {};
        result.data = new Uint8Array(response, RESPONSE_HEADER_SIZE, dataSize);
        return result;
    }

    enterUpgradeMode()
    {
        throw "Not implemented";
    }

    // omitted: common 'assertResponse' function
}


class AtmelDapProtocolCmdRspLink
{
    constructor(dapProtocolVendorCommands)
    {
        this.vendorCommands = dapProtocolVendorCommands;
    }

    // Send data as a sequence of AVR_CMDs
    write(data)
    {
        var maxChunkSize = this.vendorCommands.maxAvrCommandDataSize;
        var numChunks = Math.ceil(data.byteLength / maxChunkSize);

        if (numChunks > 15)
            throw "Data too large to be written as a sequence of AVR_CMDs";

        var chunkIndex = 0;
        var sequence = Promise.resolve();
        while (chunkIndex < numChunks)
        {
            var dataOffset = maxChunkSize * chunkIndex;
            var chunkSize = Math.min(maxChunkSize, data.byteLength - dataOffset);
            var chunk = new Uint8Array(data, dataOffset, chunkSize)
            // ALT 1
            var chunkSender = function(_vendorCommands, _chunk, _chunkIndex, _numChunks) {
                return _vendorCommands.sendAvrCommand(_chunk, _chunkIndex + 1, _numChunks);
            };
            sequence = sequence.then(chunkSender(this.vendorCommands, chunk, chunkIndex, numChunks));
            // ALT 2 (not working, because variables are not in a closure?)
            //sequence = sequence.then(() => {
            //    return this.vendorCommands.sendAvrCommand(chunk, chunkIndex + 1, numChunks);
            //});
            chunkIndex++;
        }
        return sequence;
    }

    // Read data as a sequence of AVR_RSPs
    read(numBytes)
    {
        var data = new Uint8Array(numBytes);
        var dataOffset = 0;

        var retriesLeftWithoutData = 5; // poor man's timeout (there MUST be a real timeout for the while loop in case of protocol errors)

        while (retriesLeftWithoutData)
        {
            var result = this.vendorCommands.receiveAvrResponse();

            //result.packetIndex = sequence >> 4;
            //result.numPackets = sequence & 0x0F;
            //result.data = new Uint8Array(response, 4, dataSize);

            // If there was meaningful data
            if (result.numPackets) {
                // omitted: check if packetIndex etc is as expected
                data.set(result.data, dataOffset);
                dataOffset += result.data.byteLength;
                if (result.packetIndex == result.numPackets) // If final packet
                    return data.subarray(0, dataOffset);
                retriesLeftWithoutData = 5;
            }
            else {
                // omitted: wait for a while before trying again... rewrite using Promises or similar
                retriesLeftWithoutData--;
            }
        }

        throw "Never got expected data on AVR_RSP"
    }

}

/*
class DapProtocolEvtLink : public Link
{
public:
    DapProtocolEvtLink(boost::shared_ptr<DapProtocolExt> dapProtocolExt) : mDapProtocolExt(dapProtocolExt) { }
    ~DapProtocolEvtLink() { }

    // Read event as AVR_EVT
    bool read(std::size_t numBytes, unsigned int timeout, Packet& response) const
    {
        response.resize(numBytes);
        Packet::iterator responseIt = response.begin();

        uint16_t packetSize = 0;
        if (!mDapProtocolExt->receiveAvrEvent(responseIt, &packetSize))
            return false;
        if (!packetSize)
            return false;

        response.resize(packetSize);
        return true;
    }

    // No data to send on en event link
    void write(const Packet& command, unsigned int timeout) const
    {
        throw("DapProtocolEvtLink::write should not be called.");
    }

private:
    boost::shared_ptr<DapProtocolExt> mDapProtocolExt;
};
*/

