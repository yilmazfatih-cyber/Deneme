import SwiftUI
import UIKit

/// Ajanın "eli": iOS başka uygulamalara dokunmaya izin vermez, ama klavye odaklı alana yazabilir.
/// Klavye, yayın uzantısının gördüğü ekranı ve alanın türünü birleştirip doğru değeri tek dokunuşa indirir.
final class KeyboardViewController: UIInputViewController {
    private let model = KeyboardModel()
    private var host: UIHostingController<KeyboardView>?

    override func viewDidLoad() {
        super.viewDidLoad()

        model.actions = KeyboardActions(
            insert: { [weak self] text in self?.textDocumentProxy.insertText(text) },
            deleteBackward: { [weak self] in self?.textDocumentProxy.deleteBackward() },
            clearField: { [weak self] in self?.clearCurrentField() },
            nextKeyboard: { [weak self] in self?.advanceToNextInputMode() },
            copy: { text in UIPasteboard.general.string = text }
        )

        let host = UIHostingController(rootView: KeyboardView(model: model))
        host.view.translatesAutoresizingMaskIntoConstraints = false
        host.view.backgroundColor = .clear
        addChild(host)
        view.addSubview(host.view)
        NSLayoutConstraint.activate([
            host.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            host.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            host.view.topAnchor.constraint(equalTo: view.topAnchor),
            host.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
        host.didMove(toParent: self)
        self.host = host

        let height = view.heightAnchor.constraint(equalToConstant: 310)
        height.priority = .defaultHigh
        height.isActive = true

        DarwinNotifier.observe(AppConfig.Notice.analysisUpdated) { [weak self] in
            DispatchQueue.main.async { self?.refresh() }
        }
        DarwinNotifier.observe(AppConfig.Notice.profileUpdated) { [weak self] in
            DispatchQueue.main.async { self?.refresh() }
        }
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        refresh()
    }

    /// Kullanıcı başka bir alana geçtiğinde de çağrılır; öneriler yeni alana göre yeniden sıralanır.
    override func textDidChange(_ textInput: UITextInput?) {
        super.textDidChange(textInput)
        refresh()
    }

    private func refresh() {
        model.reload(
            // İsteğe bağlı ObjC özelliği: iç içe opsiyoneli düzleştir.
            contentType: textDocumentProxy.textContentType.flatMap { $0 }?.rawValue,
            isEmailKeyboard: textDocumentProxy.keyboardType == .emailAddress,
            hasFullAccess: hasFullAccess,
            needsSwitchKey: needsInputModeSwitchKey,
            fieldIsEmpty: (textDocumentProxy.documentContextBeforeInput ?? "").isEmpty
                && (textDocumentProxy.documentContextAfterInput ?? "").isEmpty
        )
    }

    /// Alandaki metni siler. iOS klavyeye alanın yalnızca imleç çevresini gösterdiği için birkaç turda yapılır.
    private func clearCurrentField() {
        let proxy = textDocumentProxy
        if let after = proxy.documentContextAfterInput, !after.isEmpty {
            proxy.adjustTextPosition(byCharacterOffset: after.count)
        }
        for _ in 0..<20 {
            guard let before = proxy.documentContextBeforeInput, !before.isEmpty else { break }
            for _ in before { proxy.deleteBackward() }
        }
    }
}

struct KeyboardActions {
    var insert: (String) -> Void = { _ in }
    var deleteBackward: () -> Void = {}
    var clearField: () -> Void = {}
    var nextKeyboard: () -> Void = {}
    var copy: (String) -> Void = { _ in }
}

/// Bir öneri: dokununca odaklı alana yazılacak metin.
struct Suggestion: Identifiable, Hashable {
    enum Reason: String {
        case fieldType = "Alan türü"
        case focused = "İmleç burada"
        case onScreen = "Ekranda"
        case draft = "Taslak"
        case profile = "Profil"
    }

    var id: String
    var title: String
    var preview: String
    var text: String
    var reason: Reason
}

final class KeyboardModel: ObservableObject {
    @Published var primary: Suggestion?
    @Published var others: [Suggestion] = []
    @Published var agentActive = false
    @Published var statusText = ""
    @Published var screenTitle: String?
    @Published var hasFullAccess = true
    @Published var needsSwitchKey = true
    @Published var fieldIsEmpty = true
    @Published var isAnalyzing = false
    @Published var lastInserted: Suggestion?

    var actions = KeyboardActions()
    private let store = SharedStore.shared
    private var lastAnalysisTime: Date?

    func reload(contentType: String?, isEmailKeyboard: Bool, hasFullAccess: Bool, needsSwitchKey: Bool,
                fieldIsEmpty: Bool) {
        self.hasFullAccess = hasFullAccess
        self.needsSwitchKey = needsSwitchKey
        self.fieldIsEmpty = fieldIsEmpty
        guard hasFullAccess else {
            primary = nil
            others = []
            statusText = "Tam Erişim kapalı"
            return
        }

        let profile = store.loadProfile()
        let analysis = store.loadAnalysis().flatMap { $0.isFresh ? $0 : nil }
        if let time = analysis?.timestamp, time != lastAnalysisTime {
            lastAnalysisTime = time
            if analysis?.source == .claude { isAnalyzing = false }
        }
        agentActive = store.agentActive
        statusText = store.agentStatus
        screenTitle = analysis?.screenTitle
        if statusText.hasPrefix("API") || statusText.hasPrefix("Akıllı") || statusText.hasPrefix("Claude yan") {
            isAnalyzing = false
        }

        var ordered: [Suggestion] = []
        var used = Set<String>()

        func addProfile(_ key: String?, reason: Suggestion.Reason) {
            guard let key, !used.contains(key), let field = profile.field(key), !field.value.isEmpty else { return }
            used.insert(key)
            ordered.append(Suggestion(id: key, title: field.label, preview: field.preview, text: field.value,
                                      reason: reason))
        }

        func addDraft(_ field: DetectedField) {
            guard let draft = field.draftText, !draft.isEmpty else { return }
            let id = "draft:" + field.label
            guard !used.contains(id) else { return }
            used.insert(id)
            ordered.append(Suggestion(id: id, title: field.label, preview: draft, text: draft, reason: .draft))
        }

        // 1) Uygulamanın alana koyduğu tür ipucu (en güvenilir sinyal).
        addProfile(FieldMatcher.profileKey(contentType: contentType, isEmailKeyboard: isEmailKeyboard,
                                           profile: profile), reason: .fieldType)
        // 2) Akıllı analizin işaretlediği odaklı alan.
        if let focused = analysis?.fields.first(where: \.isFocused) {
            addProfile(focused.profileKey, reason: .focused)
            addDraft(focused)
        }
        // 3) Ekranda görülen diğer alanlar, yukarıdan aşağıya.
        for field in (analysis?.fields ?? []).sorted(by: { $0.y < $1.y }) {
            addProfile(field.profileKey, reason: .onScreen)
            addDraft(field)
        }
        // 4) Profilin geri kalanı.
        for field in profile.fields { addProfile(field.key, reason: .profile) }

        primary = ordered.first
        others = Array(ordered.dropFirst())
    }

    func insert(_ suggestion: Suggestion) {
        actions.insert(suggestion.text)
        lastInserted = suggestion
    }

    func requestSmartAnalysis() {
        isAnalyzing = true
        statusText = "Claude inceliyor…"
        DarwinNotifier.post(AppConfig.Notice.smartAnalysisRequested)
        DispatchQueue.main.asyncAfter(deadline: .now() + 25) { [weak self] in self?.isAnalyzing = false }
    }
}
