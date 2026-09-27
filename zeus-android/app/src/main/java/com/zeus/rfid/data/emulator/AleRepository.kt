package com.zeus.rfid.data.emulator

import com.zeus.rfid.data.model.LogicalDevice
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

class AleRepository {

    private val json = Json { ignoreUnknownKeys = true }
    private var sessionToken: String? = null
    private var sessionCookie: String? = null

    companion object {
        const val DEFAULT_USERNAME = "admin"
        const val DEFAULT_HASHED_PASSWORD = "5b21665fc7c906c1f8de64dc0534d41a673dbb4b2c76364faf2874d10acba66d"
        const val EDGE_PASSWORD_SALT = "QGFjdGl2ZQ=="
    }

    private fun cleanHost(rawHost: String): String {
        return rawHost.trim()
            .removePrefix("http://")
            .removePrefix("https://")
            .substringBefore(":")
            .substringBefore("/")
    }

    suspend fun getLogicalDevices(
        host: String,
        port: Int = 80,
        username: String = DEFAULT_USERNAME,
        passwordOrHash: String = DEFAULT_HASHED_PASSWORD
    ): Result<List<LogicalDevice>> = withContext(Dispatchers.IO) {
        try {
            val sanitizedHost = cleanHost(host)
            if (sanitizedHost.isBlank()) {
                return@withContext Result.failure(IllegalArgumentException("Invalid host address"))
            }

            // First authenticate if we don't have a token
            val token = sessionToken ?: authenticate(sanitizedHost, port, username, passwordOrHash).getOrNull()

            val url = URL("http://$sanitizedHost:$port/ALE/api/logical-device/")
            val conn = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = 6000
                readTimeout = 6000
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("Accept", "application/json")
                if (!token.isNullOrBlank()) {
                    setRequestProperty("Authorization", token)
                }
                sessionCookie?.let {
                    setRequestProperty("Cookie", it)
                }
            }

            val responseCode = conn.responseCode
            if (responseCode !in 200..299) {
                return@withContext Result.failure(Exception("HTTP $responseCode: ${conn.responseMessage}"))
            }

            val responseText = conn.inputStream.bufferedReader().use(BufferedReader::readText)
            val parsedList = parseDevices(responseText)
            Result.success(parsedList)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    private suspend fun authenticate(
        host: String,
        port: Int,
        username: String,
        passwordOrHash: String
    ): Result<String> = withContext(Dispatchers.IO) {
        try {
            val sanitizedHost = cleanHost(host)
            val hashedPassword = if (passwordOrHash.length == 64 && passwordOrHash.matches(Regex("^[a-fA-F0-9]+$"))) {
                passwordOrHash
            } else {
                sha256(passwordOrHash + EDGE_PASSWORD_SALT)
            }

            val url = URL("http://$sanitizedHost:$port/ALE/api/auth")
            val conn = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 6000
                readTimeout = 6000
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("Accept", "application/json")
            }

            val payload = """{"username":"$username","password":"$hashedPassword"}"""
            OutputStreamWriter(conn.outputStream).use {
                it.write(payload)
                it.flush()
            }

            val code = conn.responseCode
            conn.headerFields["Set-Cookie"]?.firstOrNull()?.let {
                sessionCookie = it
            }

            if (code in 200..299) {
                val body = conn.inputStream.bufferedReader().use(BufferedReader::readText).trim()
                val token = extractToken(body) ?: body
                sessionToken = token
                Result.success(token)
            } else {
                // Return basic auth token fallback using Android Base64
                val authBytes = "$username:$hashedPassword".toByteArray(Charsets.UTF_8)
                val base64Encoded = android.util.Base64.encodeToString(authBytes, android.util.Base64.NO_WRAP)
                val basic = "Basic $base64Encoded"
                sessionToken = basic
                Result.success(basic)
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    private fun extractToken(jsonStr: String): String? {
        return try {
            val element = json.parseToJsonElement(jsonStr)
            element.jsonObject["token"]?.jsonPrimitive?.content
        } catch (_: Exception) {
            null
        }
    }
    private fun getString(obj: kotlinx.serialization.json.JsonObject, key: String): String? {
        val el = obj[key] ?: return null
        return try {
            el.jsonPrimitive.content.takeIf { it != "null" && it.isNotBlank() }
        } catch (_: Exception) {
            null
        }
    }

    private fun parseDevices(jsonStr: String): List<LogicalDevice> {
        val list = ArrayList<LogicalDevice>()
        try {
            val root = json.parseToJsonElement(jsonStr)
            val array = when (root) {
                is kotlinx.serialization.json.JsonArray -> root
                is kotlinx.serialization.json.JsonObject -> {
                    root["logicalDevices"]?.jsonArray
                        ?: root["devices"]?.jsonArray
                        ?: root["data"]?.jsonArray
                        ?: root["result"]?.jsonArray
                }
                else -> null
            }
            if (array != null) {
                for (item in array) {
                    if (item !is kotlinx.serialization.json.JsonObject) continue
                    val obj = item.jsonObject
                    val uid = getString(obj, "uid")
                        ?: getString(obj, "id")
                        ?: getString(obj, "name")
                        ?: continue
                    if (uid.isBlank()) continue

                    val name = getString(obj, "name") ?: uid
                    val composite = obj["composite"]?.jsonPrimitive?.booleanOrNull ?: false
                    val vendor = getString(obj, "vendor") ?: ""
                    val groupName = getString(obj, "groupName") ?: ""
                    val antennas = obj["antennas"]?.jsonArray?.mapNotNull { it.jsonPrimitive.intOrNull } ?: emptyList()

                    list.add(
                        LogicalDevice(
                            uid = uid,
                            name = name,
                            composite = composite,
                            vendor = vendor,
                            groupName = groupName,
                            antennas = antennas
                        )
                    )
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
        return list
    }

    private fun sha256(input: String): String {
        val digest = MessageDigest.getInstance("SHA-256")
        val bytes = digest.digest(input.toByteArray())
        return bytes.joinToString("") { "%02x".format(it) }
    }
}
