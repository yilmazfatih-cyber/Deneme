// Apple'ın Security çatısının (Keychain), uygulamanın kullandığı kadarının taklidi (yalnızca tip denetimi için).
// Gerçek çatıda CFString / CFDictionary Core Foundation tipleridir ve Swift tipleriyle köprülenir;
// Linux'ta köprü olmadığı için burada doğrudan Swift tipleri kullanılır.

@_exported import Foundation

public typealias CFString = String
public typealias CFDictionary = [String: Any]
public typealias CFTypeRef = AnyObject
public typealias OSStatus = Int32

public let errSecSuccess: OSStatus = 0
public let errSecItemNotFound: OSStatus = -25300

public let kSecClass: CFString = "class"
public let kSecClassGenericPassword: CFString = "genp"
public let kSecAttrService: CFString = "svce"
public let kSecAttrAccount: CFString = "acct"
public let kSecAttrAccessible: CFString = "pdmn"
public let kSecAttrAccessibleAfterFirstUnlock: CFString = "ck"
public let kSecReturnData: CFString = "r_Data"
public let kSecMatchLimit: CFString = "m_Limit"
public let kSecMatchLimitOne: CFString = "m_LimitOne"
public let kSecValueData: CFString = "v_Data"

@discardableResult
public func SecItemCopyMatching(_ query: CFDictionary, _ result: UnsafeMutablePointer<CFTypeRef?>?) -> OSStatus { errSecItemNotFound }

@discardableResult
public func SecItemAdd(_ attributes: CFDictionary, _ result: UnsafeMutablePointer<CFTypeRef?>?) -> OSStatus { errSecSuccess }

@discardableResult
public func SecItemDelete(_ query: CFDictionary) -> OSStatus { errSecSuccess }
