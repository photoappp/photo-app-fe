Pod::Spec.new do |s|
  s.name = 'PhotoSync'
  s.version = '0.1.0'
  s.summary = 'Local photo library change tracking for PicQly'
  s.description = s.summary
  s.license = { :type => 'Proprietary' }
  s.author = 'PicQly'
  s.homepage = 'https://docs.expo.dev/modules/'
  # 2026.10.18 앱 배포 타깃(15.1)에 맞춤 — 변경 토큰(iOS 16+)은 코드에서 availability로 분기 by Claude
  s.platforms = { :ios => '15.1' }
  s.source = { :path => '.' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'Photos'
  s.swift_version = '5.9'
  s.source_files = '**/*.swift'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
