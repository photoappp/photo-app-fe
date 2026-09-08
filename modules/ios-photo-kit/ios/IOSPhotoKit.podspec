Pod::Spec.new do |s|
  s.name           = 'IOSPhotoKit'
  s.version        = '1.0.0'
  s.summary        = 'PicQly iOS PhotoKit image view'
  s.description    = 'A local Expo module that renders PhotoKit assets without converting them to file URIs.'
  s.license        = { :type => 'MIT' }
  s.author         = { 'PicQly' => 'dev@picqly.local' }
  s.homepage       = 'https://github.com/expo/expo'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'Photos', 'UIKit'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = '**/*.{h,m,mm,swift}'
end
