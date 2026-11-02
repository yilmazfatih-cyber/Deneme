import SwiftUI

@main
struct DoldurApp: App {
    var body: some Scene {
        WindowGroup {
            TabView {
                AgentView()
                    .tabItem { Label("Ajan", systemImage: "dot.radiowaves.left.and.right") }
                ProfileView()
                    .tabItem { Label("Profil", systemImage: "person.text.rectangle") }
                DemoFormView()
                    .tabItem { Label("Deneme", systemImage: "list.bullet.rectangle") }
                SettingsView()
                    .tabItem { Label("Ayarlar", systemImage: "gearshape") }
            }
        }
    }
}
