package com.zeus.rfid.data.netscan

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SubnetUtilsTest {

    @Test
    fun enumerateCidr_standardSlash24_returns254UsableHosts() {
        val hosts = SubnetUtils.enumerateCidr("192.168.1.0/24")
        assertNotNull(hosts)
        assertEquals(254, hosts!!.size)
        assertEquals("192.168.1.1", hosts.first())
        assertEquals("192.168.1.254", hosts.last())
    }

    @Test
    fun enumerateCidr_slash30_returns2UsableHosts() {
        val hosts = SubnetUtils.enumerateCidr("10.0.0.0/30")
        assertNotNull(hosts)
        assertEquals(2, hosts!!.size)
        assertEquals("10.0.0.1", hosts.first())
        assertEquals("10.0.0.2", hosts.last())
    }

    @Test
    fun enumerateCidr_invalidCidr_returnsNull() {
        assertNull(SubnetUtils.enumerateCidr("not-a-cidr"))
        assertNull(SubnetUtils.enumerateCidr("192.168.1.0/33"))
        assertNull(SubnetUtils.enumerateCidr("999.999.999.999/24"))
    }

    @Test
    fun enumerateIpRange_orderedAndReverse_producesIdenticalInclusiveList() {
        val asc = SubnetUtils.enumerateIpRange("192.168.1.10", "192.168.1.14")
        val desc = SubnetUtils.enumerateIpRange("192.168.1.14", "192.168.1.10")

        assertNotNull(asc)
        assertNotNull(desc)
        assertEquals(5, asc!!.size)
        assertEquals(asc, desc)
        assertEquals(listOf("192.168.1.10", "192.168.1.11", "192.168.1.12", "192.168.1.13", "192.168.1.14"), asc)
    }

    @Test
    fun cidrHostBounds_slash24_returnsCorrectFirstAndLast() {
        val bounds = SubnetUtils.cidrHostBounds("192.168.50.0/24")
        assertNotNull(bounds)
        assertEquals("192.168.50.1", bounds!!.first)
        assertEquals("192.168.50.254", bounds.second)
    }

    @Test
    fun readerVendor_fromSlug_mapsKnownVendorsCorrectly() {
        assertEquals(ReaderVendor.IMPINJ, ReaderVendor.fromSlug("impinj"))
        assertEquals(ReaderVendor.ZEBRA, ReaderVendor.fromSlug("zebra"))
        assertEquals(ReaderVendor.ALIEN, ReaderVendor.fromSlug("alien"))
        assertEquals(ReaderVendor.THINGMAGIC, ReaderVendor.fromSlug("thingmagic"))
        assertEquals(ReaderVendor.FEIG, ReaderVendor.fromSlug("feig"))
        assertEquals(ReaderVendor.UNKNOWN, ReaderVendor.fromSlug("nonexistent_vendor_slug"))
    }
}
