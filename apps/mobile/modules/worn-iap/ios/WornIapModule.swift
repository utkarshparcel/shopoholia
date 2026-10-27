import ExpoModulesCore
import StoreKit

/**
 StoreKit 2 for Worn. The app never finishes a transaction itself: JS calls finish() only after the
 Worn server has verified the transaction's JWS and credited it, so an unconfirmed purchase stays in
 `Transaction.unfinished` and is replayed on the next launch.
 */
public final class WornIapModule: Module {
  private var appAccountToken: UUID?
  private var updates: Task<Void, Never>?

  public func definition() -> ModuleDefinition {
    Name("WornIap")

    Events("onTransaction")

    OnDestroy {
      self.updates?.cancel()
    }

    AsyncFunction("configure") { (appAccountToken: String, _: String) async throws in
      guard let token = UUID(uuidString: appAccountToken) else {
        throw InvalidAccountTokenException()
      }
      self.appAccountToken = token
      guard self.updates == nil else {
        return
      }
      // Transactions that complete outside purchase(): Ask to Buy approvals, purchases from other devices.
      self.updates = Task.detached { [weak self] in
        for await result in Transaction.updates {
          self?.deliver(result)
        }
      }
      // Transactions bought earlier that the server never confirmed (offline, app killed).
      for await result in Transaction.unfinished {
        self.deliver(result)
      }
    }

    AsyncFunction("getProducts") { (productIds: [String], subscriptionIds: [String]) async throws -> [[String: Any]] in
      let products = try await Product.products(for: productIds + subscriptionIds)
      return products.map { product in
        [
          "id": product.id,
          "displayPrice": product.displayPrice,
          "price": NSDecimalNumber(decimal: product.price).doubleValue,
          "currencyCode": product.priceFormatStyle.currencyCode
        ]
      }
    }

    AsyncFunction("purchase") { (productId: String, _: Bool) async throws -> [String: Any] in
      guard let token = self.appAccountToken else {
        throw NotConfiguredException()
      }
      guard let product = try await Product.products(for: [productId]).first else {
        throw ProductNotFoundException(productId)
      }
      let result = try await product.purchase(options: [.appAccountToken(token)])
      switch result {
      case .success(let verification):
        guard let transaction = Self.payload(verification) else {
          return ["status": "cancelled"]
        }
        return ["status": "purchased", "transaction": transaction]
      case .pending:
        return ["status": "pending"]
      case .userCancelled:
        return ["status": "cancelled"]
      @unknown default:
        return ["status": "cancelled"]
      }
    }

    AsyncFunction("finish") { (transactionId: String, _: String, _: Bool) async in
      for await result in Transaction.unfinished {
        let transaction = result.unsafePayloadValue
        if String(transaction.id) == transactionId {
          await transaction.finish()
          return
        }
      }
    }

    AsyncFunction("restore") { () async throws -> [[String: Any]] in
      // Apple: sync only from an explicit Restore Purchases tap. It can ask the user to sign in.
      try? await AppStore.sync()
      var owned: [[String: Any]] = []
      for await result in Transaction.currentEntitlements {
        if let transaction = Self.payload(result) {
          owned.append(transaction)
        }
      }
      return owned
    }
  }

  private func deliver(_ result: VerificationResult<Transaction>) {
    guard let transaction = Self.payload(result) else {
      // Revoked (refunded) before the server confirmed it: nothing to credit, so close it out.
      Task {
        await result.unsafePayloadValue.finish()
      }
      return
    }
    sendEvent("onTransaction", transaction)
  }

  /**
   The server verifies the JWS against Apple's root certificates, so even a transaction StoreKit
   could not verify on device is sent for the server to judge. A revoked one grants nothing.
   */
  private static func payload(_ result: VerificationResult<Transaction>) -> [String: Any]? {
    let transaction = result.unsafePayloadValue
    if transaction.revocationDate != nil {
      return nil
    }
    return [
      "productId": transaction.productID,
      "transactionId": String(transaction.id),
      "proof": result.jwsRepresentation
    ]
  }
}

final internal class InvalidAccountTokenException: Exception {
  override var reason: String {
    "appAccountToken must be a UUID"
  }
}

final internal class NotConfiguredException: Exception {
  override var reason: String {
    "Call configure() with the signed-in Worn account before purchase()"
  }
}

final internal class ProductNotFoundException: GenericException<String> {
  override var reason: String {
    "The App Store has no product \(param)"
  }
}
