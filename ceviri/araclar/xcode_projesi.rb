# Ceviri.xcodeproj dosyasını baştan üretir.
#
# Kullanım (depo kökünden):
#   gem install xcodeproj
#   ruby ceviri/araclar/xcode_projesi.rb
#
# Ayarlar bilerek sade ve sağlamdır: Swift 5 dil kipi, en az eşzamanlılık denetimi, iOS 18.0.
# Böylece Xcode 16 ve sonrasındaki her sürümde, SDK'ların Sendable işaretleri değişse de derlenir.
require 'fileutils'
require 'xcodeproj'

KOK = File.expand_path('..', __dir__)
PROJE = File.join(KOK, 'Ceviri.xcodeproj')

FileUtils.rm_rf(PROJE)
proje = Xcodeproj::Project.new(PROJE, false, 56) # 56: Xcode 14 ve sonrası açar
proje.root_object.compatibility_version = 'Xcode 14.0'
proje.root_object.development_region = 'tr'
proje.root_object.known_regions = %w[tr Base]
proje.root_object.attributes['LastSwiftUpdateCheck'] = '1600'
proje.root_object.attributes['LastUpgradeCheck'] = '1600'
proje.root_object.attributes['BuildIndependentTargetsInParallel'] = '1'
# Gem en yeni biçimi (100) önerir; proje 56 biçiminde yazıldığı için ikisi aynı olmalı.
proje.root_object.preferred_project_object_version = '56'

hedef = proje.new_target(:application, 'Ceviri', :ios, '18.0', nil, :swift)
# Varsayılan olarak eklenen çerçeve bağlantılarını kaldır; Swift modülleri kendiliğinden bağlanır.
hedef.frameworks_build_phase.files.to_a.each(&:remove_from_project)
proje.frameworks_group.clear if proje.frameworks_group
proje.frameworks_group&.remove_from_project

grup = proje.main_group.new_group('Ceviri', 'Ceviri')
kaynak = grup.new_file('CeviriApp.swift')
varliklar = grup.new_file('Assets.xcassets')
grup.new_file('Info.plist')
hedef.add_file_references([kaynak])
hedef.resources_build_phase.add_file_reference(varliklar)

hedef_ayarlari = {
  'PRODUCT_NAME' => '$(TARGET_NAME)',
  # Ekip seçilince kimlik ekibe özgü olur; ücretsiz Apple hesabıyla da çakışmadan imzalanır.
  'PRODUCT_BUNDLE_IDENTIFIER' => 'tr.ceviri.canli.$(DEVELOPMENT_TEAM)',
  'DEVELOPMENT_TEAM' => '',
  'CODE_SIGN_STYLE' => 'Automatic',
  'IPHONEOS_DEPLOYMENT_TARGET' => '18.0',
  'TARGETED_DEVICE_FAMILY' => '1',
  'SWIFT_VERSION' => '5.0',
  'SWIFT_STRICT_CONCURRENCY' => 'minimal',
  'SWIFT_EMIT_LOC_STRINGS' => 'NO',
  'MARKETING_VERSION' => '1.0',
  'CURRENT_PROJECT_VERSION' => '1',
  'GENERATE_INFOPLIST_FILE' => 'YES',
  'INFOPLIST_FILE' => 'Ceviri/Info.plist',
  'INFOPLIST_KEY_CFBundleDisplayName' => 'Çeviri',
  'INFOPLIST_KEY_UILaunchScreen_Generation' => 'YES',
  'INFOPLIST_KEY_UIApplicationSceneManifest_Generation' => 'YES',
  'INFOPLIST_KEY_UIApplicationSupportsIndirectInputEvents' => 'YES',
  'INFOPLIST_KEY_UISupportedInterfaceOrientations_iPhone' => 'UIInterfaceOrientationPortrait',
  'INFOPLIST_KEY_UIUserInterfaceStyle' => 'Dark',
  'ASSETCATALOG_COMPILER_APPICON_NAME' => 'AppIcon',
  'ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME' => 'AccentColor',
  'ENABLE_PREVIEWS' => 'YES',
  'LD_RUNPATH_SEARCH_PATHS' => ['$(inherited)', '@executable_path/Frameworks'],
}

hedef.build_configurations.each do |ayar|
  ayar.build_settings.merge!(hedef_ayarlari)
  ayar.build_settings.delete('ASSETCATALOG_COMPILER_LAUNCHIMAGE_NAME')
  ayar.build_settings.delete('CODE_SIGN_IDENTITY[sdk=iphoneos*]')
end

proje.build_configurations.each do |ayar|
  ayar.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '18.0'
  ayar.build_settings['SDKROOT'] = 'iphoneos'
  ayar.build_settings['SWIFT_VERSION'] = '5.0'
  # Xcode 15/16'nın "önerilen ayarlar" listesindekiler; yoksa Xcode güncelleme önerir.
  ayar.build_settings['ENABLE_USER_SCRIPT_SANDBOXING'] = 'YES'
  ayar.build_settings['ASSETCATALOG_COMPILER_GENERATE_SWIFT_ASSET_SYMBOL_EXTENSIONS'] = 'YES'
  ayar.build_settings['LOCALIZATION_PREFERS_STRING_CATALOGS'] = 'YES'
  ayar.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'gnu++20'
  ayar.build_settings['GCC_C_LANGUAGE_STANDARD'] = 'gnu17'
end

# Kimlikler dosya yollarından türetilsin; proje yeniden üretilince git farkı oluşmasın.
proje.predictabilize_uuids
proje.save

# Paylaşılan şema: Xcode'da hedef seçilip ▶︎ ile çalıştırılır.
sema = Xcodeproj::XCScheme.new
sema.configure_with_targets(hedef, nil, launch_target: true)
sema.save_as(PROJE, 'Ceviri', true)

puts "yazıldı: #{PROJE}"
