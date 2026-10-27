package expo.modules.worniap

import com.android.billingclient.api.AcknowledgePurchaseParams
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClient.BillingResponseCode
import com.android.billingclient.api.BillingClient.ProductType
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.ConsumeParams
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.PurchasesUpdatedListener
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlin.coroutines.resume

/**
 * Google Play Billing for Worn. The app never consumes or acknowledges a purchase itself: JS calls
 * finish() only after the Worn server has verified the purchase token and credited it, so an
 * unconfirmed purchase is still returned by queryPurchasesAsync on the next launch.
 */
class WornIapModule : Module() {
  private var billingClient: BillingClient? = null
  private val connecting = Mutex()
  private var obfuscatedAccountId: String? = null
  private val productDetails = mutableMapOf<String, ProductDetails>()

  @Volatile
  private var waitingPurchase: CompletableDeferred<Map<String, Any?>>? = null

  private val purchasesUpdated = PurchasesUpdatedListener { result, purchases ->
    onPurchasesUpdated(result, purchases)
  }

  override fun definition() = ModuleDefinition {
    Name("WornIap")

    Events("onTransaction")

    OnDestroy {
      billingClient?.endConnection()
      billingClient = null
    }

    AsyncFunction("configure") Coroutine { _: String, accountId: String ->
      obfuscatedAccountId = accountId
      replayUnfinished(connectedClient())
    }

    AsyncFunction("getProducts") Coroutine { productIds: List<String>, subscriptionIds: List<String> ->
      val client = connectedClient()
      val found = queryDetails(client, productIds, ProductType.INAPP) +
        queryDetails(client, subscriptionIds, ProductType.SUBS)
      found.forEach { productDetails[it.productId] = it }
      found.mapNotNull { productRecord(it) }
    }

    AsyncFunction("purchase") Coroutine { productId: String, subscription: Boolean ->
      val accountId = obfuscatedAccountId ?: throw NotConfiguredException()
      val activity = appContext.currentActivity ?: throw Exceptions.MissingActivity()
      val client = connectedClient()
      val type = if (subscription) ProductType.SUBS else ProductType.INAPP
      val details = productDetails[productId]
        ?: queryDetails(client, listOf(productId), type).firstOrNull()
        ?: throw ProductNotFoundException(productId)

      val productParams = BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(details)
      offerToken(details, subscription)?.let { productParams.setOfferToken(it) }
      val flowParams = BillingFlowParams.newBuilder()
        .setProductDetailsParamsList(listOf(productParams.build()))
        .setObfuscatedAccountId(accountId)
        .build()

      val outcome = CompletableDeferred<Map<String, Any?>>()
      waitingPurchase?.complete(CANCELLED)
      waitingPurchase = outcome
      val launch = withContext(Dispatchers.Main) { client.launchBillingFlow(activity, flowParams) }
      when (launch.responseCode) {
        BillingResponseCode.OK -> outcome.await()
        BillingResponseCode.USER_CANCELED -> {
          waitingPurchase = null
          CANCELLED
        }
        else -> {
          waitingPurchase = null
          throw BillingException(launch)
        }
      }
    }

    AsyncFunction("finish") Coroutine { _: String, purchaseToken: String, consumable: Boolean ->
      val client = connectedClient()
      val result = if (consumable) {
        consume(client, purchaseToken)
      } else {
        acknowledge(client, purchaseToken)
      }
      // ITEM_NOT_OWNED: the server already consumed it.
      if (result.responseCode != BillingResponseCode.OK && result.responseCode != BillingResponseCode.ITEM_NOT_OWNED) {
        throw BillingException(result)
      }
    }

    AsyncFunction("restore") Coroutine { ->
      queryOwned(connectedClient(), ProductType.SUBS).mapNotNull { transactionRecord(it) }
    }
  }

  private fun onPurchasesUpdated(result: BillingResult, purchases: List<Purchase>?) {
    val waiting = waitingPurchase
    waitingPurchase = null
    when (result.responseCode) {
      BillingResponseCode.OK -> {
        var answered = false
        for (purchase in purchases.orEmpty()) {
          val transaction = transactionRecord(purchase)
          if (waiting != null && !answered) {
            answered = true
            waiting.complete(
              if (transaction != null) mapOf("status" to "purchased", "transaction" to transaction) else PENDING
            )
          } else if (transaction != null) {
            sendEvent("onTransaction", transaction)
          }
        }
        if (!answered) waiting?.complete(PENDING)
      }
      BillingResponseCode.USER_CANCELED -> waiting?.complete(CANCELLED)
      BillingResponseCode.ITEM_ALREADY_OWNED -> {
        // An earlier purchase of this pack was never confirmed: send it through the queue first.
        waiting?.complete(CANCELLED)
        billingClient?.let { client ->
          appContext.backgroundCoroutineScope.launch { replayUnfinished(client) }
        }
      }
      else -> waiting?.completeExceptionally(BillingException(result))
    }
  }

  /** Purchases that were paid but never consumed or acknowledged: the server hasn't confirmed them. */
  private suspend fun replayUnfinished(client: BillingClient) {
    val coins = queryOwned(client, ProductType.INAPP)
    val subscriptions = queryOwned(client, ProductType.SUBS).filter { !it.isAcknowledged }
    for (purchase in coins + subscriptions) {
      transactionRecord(purchase)?.let { sendEvent("onTransaction", it) }
    }
  }

  private suspend fun connectedClient(): BillingClient = connecting.withLock {
    val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
    val client = billingClient ?: BillingClient.newBuilder(context)
      .setListener(purchasesUpdated)
      .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
      .enableAutoServiceReconnection()
      .build()
      .also { billingClient = it }
    if (client.isReady) return@withLock client
    val result = suspendCancellableCoroutine { continuation ->
      client.startConnection(object : BillingClientStateListener {
        override fun onBillingSetupFinished(billingResult: BillingResult) {
          if (continuation.isActive) continuation.resume(billingResult)
        }

        override fun onBillingServiceDisconnected() {
          // enableAutoServiceReconnection() reconnects on the next request.
        }
      })
    }
    if (result.responseCode != BillingResponseCode.OK) throw BillingException(result)
    client
  }

  private suspend fun queryDetails(client: BillingClient, ids: List<String>, type: String): List<ProductDetails> {
    if (ids.isEmpty()) return emptyList()
    val params = QueryProductDetailsParams.newBuilder()
      .setProductList(
        ids.map { QueryProductDetailsParams.Product.newBuilder().setProductId(it).setProductType(type).build() }
      )
      .build()
    return suspendCancellableCoroutine { continuation ->
      client.queryProductDetailsAsync(params) { billingResult, queryResult ->
        if (!continuation.isActive) return@queryProductDetailsAsync
        // Products the store doesn't return are hidden by the app.
        continuation.resume(
          if (billingResult.responseCode == BillingResponseCode.OK) queryResult.productDetailsList else emptyList()
        )
      }
    }
  }

  private suspend fun queryOwned(client: BillingClient, type: String): List<Purchase> {
    val params = QueryPurchasesParams.newBuilder().setProductType(type).build()
    return suspendCancellableCoroutine { continuation ->
      client.queryPurchasesAsync(params) { billingResult, purchases ->
        if (!continuation.isActive) return@queryPurchasesAsync
        continuation.resume(if (billingResult.responseCode == BillingResponseCode.OK) purchases else emptyList())
      }
    }
  }

  private suspend fun consume(client: BillingClient, purchaseToken: String): BillingResult {
    val params = ConsumeParams.newBuilder().setPurchaseToken(purchaseToken).build()
    return suspendCancellableCoroutine { continuation ->
      client.consumeAsync(params) { billingResult, _ ->
        if (continuation.isActive) continuation.resume(billingResult)
      }
    }
  }

  private suspend fun acknowledge(client: BillingClient, purchaseToken: String): BillingResult {
    val params = AcknowledgePurchaseParams.newBuilder().setPurchaseToken(purchaseToken).build()
    return suspendCancellableCoroutine { continuation ->
      client.acknowledgePurchase(params) { billingResult ->
        if (continuation.isActive) continuation.resume(billingResult)
      }
    }
  }

  /** Subscriptions: the eligible offer with the cheapest first phase (the free trial when offered). */
  private fun offerToken(details: ProductDetails, subscription: Boolean): String? =
    if (subscription) {
      details.subscriptionOfferDetails
        ?.minByOrNull { it.pricingPhases.pricingPhaseList.firstOrNull()?.priceAmountMicros ?: Long.MAX_VALUE }
        ?.offerToken
    } else {
      details.oneTimePurchaseOfferDetailsList?.firstOrNull()?.offerToken
    }

  private fun productRecord(details: ProductDetails): Map<String, Any?>? {
    val oneTime = details.oneTimePurchaseOfferDetails
    if (oneTime != null) {
      return mapOf(
        "id" to details.productId,
        "displayPrice" to oneTime.formattedPrice,
        "price" to oneTime.priceAmountMicros / 1_000_000.0,
        "currencyCode" to oneTime.priceCurrencyCode
      )
    }
    // A subscription's price is the base plan's recurring phase.
    val basePlan = details.subscriptionOfferDetails?.firstOrNull { it.offerId == null } ?: return null
    val recurring = basePlan.pricingPhases.pricingPhaseList.lastOrNull() ?: return null
    return mapOf(
      "id" to details.productId,
      "displayPrice" to recurring.formattedPrice,
      "price" to recurring.priceAmountMicros / 1_000_000.0,
      "currencyCode" to recurring.priceCurrencyCode
    )
  }

  /** Only a completed payment with an order id goes to the server. Pending purchases wait for the listener. */
  private fun transactionRecord(purchase: Purchase): Map<String, Any?>? {
    if (purchase.purchaseState != Purchase.PurchaseState.PURCHASED) return null
    val productId = purchase.products.firstOrNull() ?: return null
    return mapOf(
      "productId" to productId,
      // Promo-code purchases have no order id; the server keys those on the token.
      "transactionId" to (purchase.orderId ?: purchase.purchaseToken),
      "proof" to purchase.purchaseToken
    )
  }

  private companion object {
    val CANCELLED: Map<String, Any?> = mapOf("status" to "cancelled")
    val PENDING: Map<String, Any?> = mapOf("status" to "pending")
  }
}

internal class NotConfiguredException :
  CodedException("E_NOT_CONFIGURED", "Call configure() with the signed-in Worn account before purchase()", null)

internal class ProductNotFoundException(productId: String) :
  CodedException("E_PRODUCT_NOT_FOUND", "Google Play has no product $productId", null)

internal class BillingException(result: BillingResult) :
  CodedException("E_BILLING_${result.responseCode}", result.debugMessage, null)
