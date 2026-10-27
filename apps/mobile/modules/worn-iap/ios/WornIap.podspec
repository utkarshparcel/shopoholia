Pod::Spec.new do |s|
  s.name           = 'WornIap'
  s.version        = '1.0.0'
  s.summary        = 'App Store purchases for Worn on StoreKit 2'
  s.description    = 'Coin packs and Closet Premium through StoreKit 2. Transactions finish only after the Worn server confirms them.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
