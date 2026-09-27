package com.zeus.rfid.data.repository

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class EdgeHeartbeatParserTest {

    @Test
    fun parseHeartbeat_validXml_extractsAllFieldsCorrectly() {
        val sampleXml = """
            <CEdgeHeartBeatModel>
                <Guid>c8b35f20-94d1-4a8b-9e20-7f28ab1c3d4e</Guid>
                <MACAddress>00:1A:2B:3C:4D:5E</MACAddress>
                <Version>10.2.3</Version>
                <LastPDUpdate>2026-09-24 10:45:12</LastPDUpdate>
                <Errors></Errors>
                <CProperty>
                    <Name>IPAddress</Name>
                    <Value>192.168.1.142</Value>
                </CProperty>
                <CProperty>
                    <Name>Port</Name>
                    <Value>12352</Value>
                </CProperty>
                <CProperty>
                    <Name>showDashBoardInfo</Name>
                    <Value>1</Value>
                </CProperty>
                <CProperty>
                    <Name>Type</Name>
                    <Value>EdgeDevice</Value>
                </CProperty>
            </CEdgeHeartBeatModel>
        """.trimIndent()

        val server = EdgeHeartbeatParser.parseHeartbeat(sampleXml, "192.168.1.142")

        assertNotNull(server)
        assertEquals("c8b35f20-94d1-4a8b-9e20-7f28ab1c3d4e", server!!.id)
        assertEquals("Edge (00:1A:2B:3C:4D:5E)", server.name)
        assertEquals("192.168.1.142", server.host)
        assertEquals(12352, server.port)
        assertEquals("00:1A:2B:3C:4D:5E", server.attributes["mac"])
        assertEquals("10.2.3", server.attributes["version"])
        assertEquals("UDP", server.attributes["protocol"])
        assertEquals("2026-09-24 10:45:12", server.attributes["lastPDUpdate"])
    }

    @Test
    fun parseHeartbeat_missingPort_defaultsTo12352() {
        val xmlWithoutPort = """
            <CEdgeHeartBeatModel>
                <MACAddress>00:1A:2B:88:99:AA</MACAddress>
                <CProperty>
                    <Name>IPAddress</Name>
                    <Value>192.168.1.55</Value>
                </CProperty>
            </CEdgeHeartBeatModel>
        """.trimIndent()

        val server = EdgeHeartbeatParser.parseHeartbeat(xmlWithoutPort, "192.168.1.55")

        assertNotNull(server)
        assertEquals(12352, server!!.port)
        assertEquals("192.168.1.55", server.host)
        assertEquals("00:1A:2B:88:99:AA", server.attributes["mac"])
    }

    @Test
    fun parseHeartbeat_invalidPayload_returnsNull() {
        val nonEdgeXml = "<SomeOtherModel><Name>Test</Name></SomeOtherModel>"
        val server = EdgeHeartbeatParser.parseHeartbeat(nonEdgeXml, "192.168.1.10")
        assertNull(server)

        val emptyPayload = ""
        val emptyServer = EdgeHeartbeatParser.parseHeartbeat(emptyPayload, "192.168.1.10")
        assertNull(emptyServer)
    }

    @Test
    fun parseHeartbeat_zeroIpInXml_fallsBackToRemoteAddress() {
        val xmlWithZeroIp = """
            <CEdgeHeartBeatModel>
                <MACAddress>00:11:22:33:44:55</MACAddress>
                <CProperty>
                    <Name>IPAddress</Name>
                    <Value>0.0.0.0</Value>
                </CProperty>
            </CEdgeHeartBeatModel>
        """.trimIndent()

        val server = EdgeHeartbeatParser.parseHeartbeat(xmlWithZeroIp, "192.168.1.88")
        assertNotNull(server)
        assertEquals("192.168.1.88", server!!.host)
    }
}
