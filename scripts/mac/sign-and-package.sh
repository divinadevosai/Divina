#!/bin/sh
# On a Mac (Codemagic "mac-release", or your own): sign, notarize and package
# build/mac/<arch>/Divina.app into dist/Divina-<version>-mac-<arch>.dmg.
#
# Needs, in the environment:
#   MAC_SIGN_ID        the "Developer ID Application: <name> (<team>)" certificate,
#                      already in the keychain (Codemagic installs it)
#   NOTARY_KEY_PATH    App Store Connect API key (.p8) file
#   NOTARY_KEY_ID      its key id
#   NOTARY_ISSUER      its issuer id
set -eu
cd "$(dirname "$0")/../.."
VERSION=$(node -p "require('./package.json').version")
ENT=scripts/mac/entitlements.plist

for ARCH in ${DIVINA_MAC_ARCHS:-arm64 x64}; do
  ARCH=$(echo "$ARCH" | tr ',' ' ')
  APP="build/mac/$ARCH/Divina.app"
  DMG="dist/Divina-$VERSION-mac-$ARCH.dmg"
  echo "▸ Signing $APP"
  # inside out: Node.js first (hardened runtime + its entitlements), then the app
  codesign --force --timestamp --options runtime --entitlements "$ENT" --sign "$MAC_SIGN_ID" "$APP/Contents/Resources/node/node"
  codesign --force --timestamp --options runtime --entitlements "$ENT" --sign "$MAC_SIGN_ID" "$APP"
  codesign --verify --deep --strict --verbose=2 "$APP"

  echo "▸ Notarizing the app (Apple checks it; this takes a few minutes)"
  rm -f "build/mac/$ARCH/Divina.zip"
  ditto -c -k --keepParent "$APP" "build/mac/$ARCH/Divina.zip"
  xcrun notarytool submit "build/mac/$ARCH/Divina.zip" --key "$NOTARY_KEY_PATH" --key-id "$NOTARY_KEY_ID" --issuer "$NOTARY_ISSUER" --wait
  # the ticket goes inside the app, so it opens even offline after being copied out of the .dmg
  xcrun stapler staple "$APP"

  echo "▸ Making $DMG"
  rm -rf "build/mac/$ARCH/dmg" "$DMG"
  mkdir -p "build/mac/$ARCH/dmg"
  cp -R "$APP" "build/mac/$ARCH/dmg/"
  ln -s /Applications "build/mac/$ARCH/dmg/Applications"
  hdiutil create -volname "Divina" -srcfolder "build/mac/$ARCH/dmg" -ov -format UDZO "$DMG"
  codesign --force --timestamp --sign "$MAC_SIGN_ID" "$DMG"

  echo "▸ Notarizing the .dmg"
  xcrun notarytool submit "$DMG" --key "$NOTARY_KEY_PATH" --key-id "$NOTARY_KEY_ID" --issuer "$NOTARY_ISSUER" --wait
  xcrun stapler staple "$DMG"
  spctl --assess --type open --context context:primary-signature --verbose=2 "$DMG"
  spctl --assess --type execute --verbose=2 "$APP"
  echo "▸ Done: $DMG"
done
