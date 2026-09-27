package com.zeus.rfid.data.nfc

import android.nfc.cardemulation.HostApduService
import android.os.Bundle

class ZeusHceService : HostApduService() {

    override fun processCommandApdu(commandApdu: ByteArray?, extras: Bundle?): ByteArray {
        if (commandApdu == null) {
            return byteArrayOf(0x6A.toByte(), 0x82.toByte())
        }
        return ZeusHceManager.processApdu(commandApdu)
    }

    override fun onDeactivated(reason: Int) {
        // Tag session terminated by reader or RF field lost
    }
}
