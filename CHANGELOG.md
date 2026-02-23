# Changelog

## [1.7.0](https://github.com/orro3790/drive/compare/v1.6.1...v1.7.0) (2026-02-23)


### Features

* **ui:** responsive Drawer — bottom sheet on mobile, fix double padding ([d04597f](https://github.com/orro3790/drive/commit/d04597f12352dc1b69cb2f3b465f543b7e3d8e89))


### Bug Fixes

* **auth:** consistent mobile layout across all auth pages ([355c2df](https://github.com/orro3790/drive/commit/355c2dfd458288ea19ac82d091868d7fe9cbf6e7))
* **ui:** add safe-area bottom padding to mobile Drawer bottom sheet ([6d198f2](https://github.com/orro3790/drive/commit/6d198f2b4046a779e2df548710c61191aabe43c1))
* **ui:** hide scrollbar on touch devices, remove filter-form padding ([69fb3c2](https://github.com/orro3790/drive/commit/69fb3c2ab258434c8b6f0e728954209e387572b8))
* **ui:** match DatePicker height to Select, shrink filter buttons ([598acc2](https://github.com/orro3790/drive/commit/598acc291ed21a8b7a79129de4f04aeb0516785b))

## [1.6.1](https://github.com/orro3790/drive/compare/v1.6.0...v1.6.1) (2026-02-23)


### Bug Fixes

* driver health reactivity, routes UI cleanup, and housekeeping ([8feab3b](https://github.com/orro3790/drive/commit/8feab3b6c1d6560d29734579fdbe622bc9bdcee6))
* **i18n:** add 20 missing keys to en.json and zh.json ([ba7d4b2](https://github.com/orro3790/drive/commit/ba7d4b22732fcf95759239083bb1ef905249641c))
* **tests:** freeze time in bidding tests so assignment dates stay in the future ([3b03627](https://github.com/orro3790/drive/commit/3b0362776d5cc71d515b609816507c5ed9a96f73))
* **tests:** update driver ID param test for non-UUID ID format ([7c99d05](https://github.com/orro3790/drive/commit/7c99d05aec1283d8a29212a864d166ebd0e98c1a))

## [1.6.0](https://github.com/orro3790/drive/compare/v1.5.0...v1.6.0) (2026-02-22)


### Features

* driver day demand bars with weekly cap enforcement ([#200](https://github.com/orro3790/drive/issues/200)) ([08de79f](https://github.com/orro3790/drive/commit/08de79ffb6742d212f3ddd72eeaba113c9b8fa23))


### Bug Fixes

* **android:** reset versionCode placeholder to match CI sed pattern ([18f5c7f](https://github.com/orro3790/drive/commit/18f5c7fa8f5825fc2ce938fdf6df78743b24c55a))
* **tests:** update preferences test for removed lock mechanism ([7a69987](https://github.com/orro3790/drive/commit/7a6998793f7bc206129406b580314fb08a5be27b))

## [1.5.0](https://github.com/orro3790/drive/compare/v1.4.1...v1.5.0) (2026-02-21)


### Features

* **driver:** add shift history views and mobile refresh polish ([f4c4466](https://github.com/orro3790/drive/commit/f4c4466bab7fd2ce8279a25e2722b4e4c57b7c79))
* **i18n:** add locale persistence endpoint and wire language selector ([f6e5de9](https://github.com/orro3790/drive/commit/f6e5de9e30d720a0644cd91983d691a6e994e657))
* **i18n:** migrate all customBody callers to renderBody ([49a71d7](https://github.com/orro3790/drive/commit/49a71d7812fe40a9fbbe637c28386af02f6ff13b))
* **i18n:** refactor sendManagerAlert and bulk notification paths ([edd273d](https://github.com/orro3790/drive/commit/edd273d010e4cab854d7dd7e08063328a4efe626))
* **i18n:** remove NOTIFICATION_TEMPLATES and customBody/customTitle ([44273b9](https://github.com/orro3790/drive/commit/44273b9951ea356cd9b0e2e632be5d0b1d8f12b0))
* manager shift edit, passkey UX, auth dark mode ([3c8b056](https://github.com/orro3790/drive/commit/3c8b056c1fd3bf6832eb38407e40ad26906fd518))
* **notifications:** add locale-aware rendering to sendNotification ([f6a1d7f](https://github.com/orro3790/drive/commit/f6a1d7fa2c603e0ea9889cee692bd178688adbc3))


### Bug Fixes

* **api:** guard malformed JSON in write endpoints ([#170](https://github.com/orro3790/drive/issues/170)) ([461a699](https://github.com/orro3790/drive/commit/461a699d3d8f7ef2d63ac48d44729c8a451a905a))
* **api:** standardize error envelope to { message } pattern ([#191](https://github.com/orro3790/drive/issues/191)) ([9c0d829](https://github.com/orro3790/drive/commit/9c0d8291ee265a3e143aa86e8bfe539175ed8351))
* **api:** validate UUID path params for dynamic routes ([#171](https://github.com/orro3790/drive/issues/171)) ([3394d0f](https://github.com/orro3790/drive/commit/3394d0fb62ed210608039a7de8b44941a5d2dcb0))
* **auth:** block revoked join signups before user creation ([#165](https://github.com/orro3790/drive/issues/165)) ([4a0c459](https://github.com/orro3790/drive/commit/4a0c45974c4110cbacbeb539e83d32b308ec4c02))
* **auth:** fail closed on join-signup finalize races ([#160](https://github.com/orro3790/drive/issues/160)) ([fcedba4](https://github.com/orro3790/drive/commit/fcedba4a3e3618bdbeb1bdda93ff7cd226f0a87e))
* **auth:** roll back create-signup users when finalize fails ([#162](https://github.com/orro3790/drive/issues/162)) ([b6986ae](https://github.com/orro3790/drive/commit/b6986ae353b86963f363b3f947d54f85dea15b51))
* **bidding:** keep durable bid-window creates successful when fanout fails ([#163](https://github.com/orro3790/drive/issues/163)) ([98320d5](https://github.com/orro3790/drive/commit/98320d5b1dddde68682050e6f15f916c7254a79e))
* **bidding:** make createBidWindow durable on insert failures ([#158](https://github.com/orro3790/drive/issues/158)) ([815245b](https://github.com/orro3790/drive/commit/815245b2103fc47df13f85e07f4917b1c2e264d6))
* **cancellation:** use route start time for late-cancel cutoff ([#167](https://github.com/orro3790/drive/issues/167)) ([fab2e31](https://github.com/orro3790/drive/commit/fab2e31ab85fd41a706d977ee7026fac574dbed0))
* **cron:** align auto-drop DST cutoff with confirmation deadline ([af9cba9](https://github.com/orro3790/drive/commit/af9cba98d2fd2bef5affb9dfe44512c6deb30b8e))
* **dashboard:** block concurrent complete-shift mutations ([#172](https://github.com/orro3790/drive/issues/172)) ([2436e84](https://github.com/orro3790/drive/commit/2436e84c56ecfba52126c537e4e9933364f419e7))
* **dashboard:** guard complete-shift rollback by mutation version ([#169](https://github.com/orro3790/drive/issues/169)) ([02def30](https://github.com/orro3790/drive/commit/02def301a3a554d1ba9f4d55d18f2b73fbfd9e5d))
* **driver:** include remaining schedule action-circle styles ([55f9d94](https://github.com/orro3790/drive/commit/55f9d94af3f2af76806151264bb487f59909979b))
* **driver:** reconcile remaining schedule page changes ([da1a1ab](https://github.com/orro3790/drive/commit/da1a1ab1b8353d2b62c4bf239d1bf3821f5902b9))
* **i18n:** add Korean locale, fix typography/dark mode, i18n hardcoded strings ([95a04e4](https://github.com/orro3790/drive/commit/95a04e429286a4e4aa96e0dff68cc15752d5f8b6))
* **i18n:** add missing admin reset-password and weekly cap message keys ([#198](https://github.com/orro3790/drive/issues/198)) ([3ca5a32](https://github.com/orro3790/drive/commit/3ca5a32cc2436890c509e843f16b4d3a43ab7f05))
* **i18n:** add missing zh locale keys ([#195](https://github.com/orro3790/drive/issues/195)) ([dd3c16e](https://github.com/orro3790/drive/commit/dd3c16e8796680abe73bb14ca3413cefd04be403))
* **i18n:** audit driver and manager route copy coverage ([#194](https://github.com/orro3790/drive/issues/194)) ([87c3cb5](https://github.com/orro3790/drive/commit/87c3cb54399875935a403883a27348f7db8dd7ce))
* **i18n:** localize driver route/component hardcoded copy ([#197](https://github.com/orro3790/drive/issues/197)) ([89beb79](https://github.com/orro3790/drive/commit/89beb79ee9e45b4a1b17ff9a7d1483f102e0f890))
* **i18n:** localize relative time labels in notification cards ([8c75ea9](https://github.com/orro3790/drive/commit/8c75ea93b9f574cc60fb8afbe8c4ca2aaf33ebe6))
* **i18n:** localize shift date/time formatting in notifications ([d6758ef](https://github.com/orro3790/drive/commit/d6758efe40bce77f8bb2a6a15c4057917af2f97b))
* **i18n:** resolve code review findings for notification localization ([f17f9c8](https://github.com/orro3790/drive/commit/f17f9c81480ed029dcffe09d938b9f569fe5ae57))
* **nightly:** add operational alerting for full nightly failures ([#184](https://github.com/orro3790/drive/issues/184)) ([b0a577a](https://github.com/orro3790/drive/commit/b0a577ac64e6b59125c715ada082fc7036783503))
* **nightly:** enforce witness gating and deterministic readiness ([#175](https://github.com/orro3790/drive/issues/175)) ([3fe597c](https://github.com/orro3790/drive/commit/3fe597cb280d00bee0d75d626b6ab658f4912f2b))
* **nightly:** fail orchestrator when witness run is skipped ([#187](https://github.com/orro3790/drive/issues/187)) ([bd0834c](https://github.com/orro3790/drive/commit/bd0834c12f96b5fb3b38518cfa47a958bfe0a33f))
* **nightly:** propagate upstream cron failure into witness verdict ([#183](https://github.com/orro3790/drive/issues/183)) ([4fe4190](https://github.com/orro3790/drive/commit/4fe41901f03812a4a256ffb5b015a506793ebf4a))
* **nightly:** validate drill report verdicts in orchestrator ([#174](https://github.com/orro3790/drive/issues/174)) ([1535c39](https://github.com/orro3790/drive/commit/1535c39103bccbc0136a17fc391d6d659e81bb90))
* **notifications:** classify FCM push failures and clear invalid tokens ([#168](https://github.com/orro3790/drive/issues/168)) ([91d250e](https://github.com/orro3790/drive/commit/91d250e6bc9c2141e1de8c76ba305df61b6d23f8))
* **notifications:** include route timing in cancellation alerts ([#186](https://github.com/orro3790/drive/issues/186)) ([b9fb4c7](https://github.com/orro3790/drive/commit/b9fb4c7e67b304247e6f98c33832812935706381))
* **notifications:** include shift date-time context in shift alerts ([#182](https://github.com/orro3790/drive/issues/182)) ([3ae69ea](https://github.com/orro3790/drive/commit/3ae69ea7e71078847759743ffe8a33b2f302949d))
* **notifications:** resolve FCM SenderId mismatch and wire shift_cancelled dispatch ([dca51ef](https://github.com/orro3790/drive/commit/dca51ef52eb4d0d31e318004072a21d9350ca3be))
* **preferences:** block writes after cycle lock deadline ([#166](https://github.com/orro3790/drive/issues/166)) ([a785075](https://github.com/orro3790/drive/commit/a78507543d827f49457d08251f91f3ee1fb6e529))
* **preferences:** enforce atomic lock-safe writes ([#161](https://github.com/orro3790/drive/issues/161)) ([b815d35](https://github.com/orro3790/drive/commit/b815d3582e20cb89f1c776d94258c77f2ddcc45e))
* **preferences:** enforce current-cycle lock boundary ([#159](https://github.com/orro3790/drive/issues/159)) ([ffc219c](https://github.com/orro3790/drive/commit/ffc219ca315f7889a306926387cb079f1dff1e94))
* reconcile PRs [#173](https://github.com/orro3790/drive/issues/173) and [#185](https://github.com/orro3790/drive/issues/185) from main into develop ([1b50fc8](https://github.com/orro3790/drive/commit/1b50fc8668d4419874ba6dfe41dc8a3e1906b8f2))
* **reliability:** harden cancellation retry and cron isolation ([4143ee4](https://github.com/orro3790/drive/commit/4143ee438ee4fec70c35c943cfb0c7df981b0a5c))
* **schedule:** preserve minutes in route start-time labels ([#181](https://github.com/orro3790/drive/issues/181)) ([d9056ed](https://github.com/orro3790/drive/commit/d9056ed8ee7c1e04f624c0e48fbf96f925d42084))
* **scheduling:** pin assignment week-start checks to Toronto date-only math ([#164](https://github.com/orro3790/drive/issues/164)) ([893bea2](https://github.com/orro3790/drive/commit/893bea254139d2b900c0141b854508780c3a1983))
* **scheduling:** unify DST deadline enforcement model ([417d72d](https://github.com/orro3790/drive/commit/417d72def7f1174b50708e339152b7a82fac4e56))
* **schema:** add missing i18n migration and remove stale Leap artifact ([c2ee038](https://github.com/orro3790/drive/commit/c2ee038cb8477397ce3ded1d19aab9bd79b88624))
* **tests:** align test mocks with i18n notification refactor ([84fc10b](https://github.com/orro3790/drive/commit/84fc10baf6467f4ec0ceb9a5fd67c7aae0270121))
* **ui:** add 44px coarse-pointer touch targets to auth toggles and checkbox ([3edf61c](https://github.com/orro3790/drive/commit/3edf61cac81b64eaca1f7458a1b6cf27b91a50ce))

## [1.4.1](https://github.com/orro3790/drive/compare/v1.4.0...v1.4.1) (2026-02-17)


### Bug Fixes

* **android:** native edge-to-edge inset handling ([5e19b64](https://github.com/orro3790/drive/commit/5e19b641e5395ef7bb9da2de80a629a7c8af740f))
* **android:** native edge-to-edge inset handling ([#156](https://github.com/orro3790/drive/issues/156)) ([7f18849](https://github.com/orro3790/drive/commit/7f18849a8563dfff416829c54d6fac42453f14b8))
* **android:** proper edge-to-edge safe area handling ([fca3f61](https://github.com/orro3790/drive/commit/fca3f61ff857f689ae1db7c3ac4bfc48e71a7440))
* **mobile:** environment-aware Capacitor sync ([5aa4d54](https://github.com/orro3790/drive/commit/5aa4d54e9720e40c9fa7b53f1a42c83dd40418cc))

## [1.4.0](https://github.com/orro3790/drive/compare/v1.3.0...v1.4.0) (2026-02-16)


### Features

* **routes:** add suspend/resume overrides and harden auth redirects ([01f238d](https://github.com/orro3790/drive/commit/01f238db2dd312eab4f5233c2c502a877fa686ae))


### Bug Fixes

* **driver-dashboard:** apply optimistic shift completion with rollback ([533b7b2](https://github.com/orro3790/drive/commit/533b7b2ae47deea1ec31db78d60c973a127e2152))
* **mobile-ui:** add native scroll spacer above nav bar ([10dfc1c](https://github.com/orro3790/drive/commit/10dfc1c6ad651cc5c5ebdc607eb3acf3d34845b7))
* **mobile-ui:** add safe-area padding to driver/manager layouts + improve notification card ([355fcf4](https://github.com/orro3790/drive/commit/355fcf40253d0c3f14767f29b1a5f7b9dacc71ee))
* **mobile-ui:** apply safe-area padding unconditionally like sidebar ([52aab28](https://github.com/orro3790/drive/commit/52aab284fbfe8a291b02d4090e03db80c1168dd5))
* **mobile-ui:** compute native viewport insets at runtime ([2e8ffed](https://github.com/orro3790/drive/commit/2e8ffed0ad9db76fbefae414d482d989feaf4de0))
* **mobile-ui:** enforce bottom gutter on small screens ([77c2532](https://github.com/orro3790/drive/commit/77c253292994e2bd0304acc050e05765d4b95cc2))
* **mobile-ui:** prevent Android nav bar overlap at page bottom ([c438086](https://github.com/orro3790/drive/commit/c438086467fb5533b17ee7c94b1f856ef81459fb))
* **mobile-ui:** use padding instead of spacer for Android nav bar insets ([6564591](https://github.com/orro3790/drive/commit/656459153bed903efaf97bd181c1e2cc283ee07e))
* **notifications:** harden FCM token ownership and registration flow ([c071508](https://github.com/orro3790/drive/commit/c071508506d1828152d8c7897b218ef53a1544fd))
* **notifications:** preserve cached token across logout ([0ea221a](https://github.com/orro3790/drive/commit/0ea221afcc04b2ebd72fbaba570978cb504878b2))

## [1.3.0](https://github.com/orro3790/drive/compare/v1.2.2...v1.3.0) (2026-02-16)


### Features

* **driver:** show route start time across shifts and bids ([a009d00](https://github.com/orro3790/drive/commit/a009d006ac327ae240d0bf40d4146ae772d67e60))
* **driver:** show route start time across shifts and bids ([f545656](https://github.com/orro3790/drive/commit/f54565647263537aa62a921518c1a9decb650d40))
* **notifications:** include route start time in shift reminders ([c2831d2](https://github.com/orro3790/drive/commit/c2831d24792142a1fb78ebd1dc6301507588b769))
* **notifications:** include shift start time in reminder push ([989a573](https://github.com/orro3790/drive/commit/989a573458ef343ca4b60ede597456f8fce9c57f))


### Bug Fixes

* **auth:** add download icon and align link typography ([66a89fa](https://github.com/orro3790/drive/commit/66a89fa58ef998045a31927cb428ecbb3808e8be))
* **auth:** add download icon and align link typography ([cbb69b4](https://github.com/orro3790/drive/commit/cbb69b4286467a66c90df0ab60f7e5b9ab942690))
* **auth:** simplify sign-in UI and restore SystemBars insets ([50722c7](https://github.com/orro3790/drive/commit/50722c7d15937cebdfbe2faeb396f87d233254cc))
* **auth:** simplify sign-in UI and restore SystemBars insets ([29847b9](https://github.com/orro3790/drive/commit/29847b9fc1e0111d9cc5e726ba3e03e1f2e04a76))
* **driver-ui:** prevent shift time wrapping on mobile ([d799907](https://github.com/orro3790/drive/commit/d7999076ba957b02880f217f643561637bfaa583))
* **driver-ui:** prevent shift time wrapping on mobile ([4489b5a](https://github.com/orro3790/drive/commit/4489b5a1549777db0f15f156689cab2bc2043c1d))
* **notifications:** harden push delivery and realtime completion updates ([33a36d9](https://github.com/orro3790/drive/commit/33a36d958460b7393d55a7506e30029a355fef2d))

## [1.2.2](https://github.com/orro3790/drive/compare/v1.2.1...v1.2.2) (2026-02-16)


### Bug Fixes

* **android:** use SystemBars safe-area insets ([#146](https://github.com/orro3790/drive/issues/146)) ([5ca4e6d](https://github.com/orro3790/drive/commit/5ca4e6d7b0c8af6cac3103e0e630f9a7bc14e6bf))
* **mobile:** harden /download and add inset fallback ([564cd9d](https://github.com/orro3790/drive/commit/564cd9d52a00e85d04a84aa463432c87463d7d0d))
* **mobile:** harden /download and add inset fallback ([#144](https://github.com/orro3790/drive/issues/144)) ([5b54762](https://github.com/orro3790/drive/commit/5b5476240674260299cb1dd97035099b5ff6876e))
* **push:** create Android channel for system tray delivery ([f067d76](https://github.com/orro3790/drive/commit/f067d761d4f9b38bf2f84bb6d4fed0c9ff679ea4))
* **push:** create Android notification channel for native delivery ([026e0b9](https://github.com/orro3790/drive/commit/026e0b9dc746d0e918a2f6105e65dd11b3f6f112))

## [1.2.1](https://github.com/orro3790/drive/compare/v1.2.0...v1.2.1) (2026-02-15)


### Bug Fixes

* **mobile:** stop PWA install + add safe-area insets ([#141](https://github.com/orro3790/drive/issues/141)) ([c9b2bd6](https://github.com/orro3790/drive/commit/c9b2bd64272fad391ca663201601d60ef5709c38))

## [1.2.0](https://github.com/orro3790/drive/compare/v1.1.6...v1.2.0) (2026-02-15)


### Features

* **android:** auto-track latest GitHub release APK ([0b8f819](https://github.com/orro3790/drive/commit/0b8f819483c7eb886cf2bce23d6586f5c29e096e))


### Bug Fixes

* **svelte:** resolve notification permission card typecheck ([524d044](https://github.com/orro3790/drive/commit/524d044e48c058373496ec4a6ad0f6ca0ad2f249))

## [1.1.6](https://github.com/orro3790/drive/compare/v1.1.5...v1.1.6) (2026-02-15)


### Bug Fixes

* **android:** bake dark background into launcher icons ([a450277](https://github.com/orro3790/drive/commit/a450277eaa75d9134f83346a19ef002e155b8aa9))
* **mobile:** auto-request notification permission with delay ([3149777](https://github.com/orro3790/drive/commit/3149777a74ffd7ac791b2ff4a5ca470da8347d69))
* **mobile:** require user action to request notification permission ([1abeab1](https://github.com/orro3790/drive/commit/1abeab157aa83d0a5fb5252e240b8b864f74f350))

## [1.1.5](https://github.com/orro3790/drive/compare/v1.1.4...v1.1.5) (2026-02-15)


### Bug Fixes

* **mobile:** regenerate app icons with dark background and improve push logging ([0f34d11](https://github.com/orro3790/drive/commit/0f34d11469ac03a63943b6799c2c31b5d57622b9))

## [1.1.4](https://github.com/orro3790/drive/compare/v1.1.3...v1.1.4) (2026-02-15)


### Bug Fixes

* **ci:** chain Android build into release-please workflow ([b1683cb](https://github.com/orro3790/drive/commit/b1683cb06a82bd78a64a84aa352ebafd45e49471))

## [1.1.3](https://github.com/orro3790/drive/compare/v1.1.2...v1.1.3) (2026-02-15)


### Bug Fixes

* **android:** add POST_NOTIFICATIONS permission for Android 13+ ([1e370ca](https://github.com/orro3790/drive/commit/1e370caba6d82d599de66a6e79dea565fdc59f5c))

## [1.1.2](https://github.com/orro3790/drive/compare/v1.1.1...v1.1.2) (2026-02-15)


### Bug Fixes

* **android:** use dark surface color for app icon background ([2023457](https://github.com/orro3790/drive/commit/202345773df8606a527abdf1189d62d2dc578874))

## [1.1.1](https://github.com/orro3790/drive/compare/v1.1.0...v1.1.1) (2026-02-15)


### Bug Fixes

* **android:** use solid purple background for app icon ([ccc7be3](https://github.com/orro3790/drive/commit/ccc7be342a29f397a8733d60e138a8f9c0d72799))

## [1.1.0](https://github.com/orro3790/drive/compare/v1.0.0...v1.1.0) (2026-02-15)

### Features

- **auth:** add WebAuthn passkey support for passwordless login ([a3d90df](https://github.com/orro3790/drive/commit/a3d90dfd19396b00760928494d6a2cc02f2dba71))
- **auth:** add WebAuthn passkey support for passwordless login ([27866b4](https://github.com/orro3790/drive/commit/27866b4021b1e133e9c39f77f15c93ca7d4f83dc))
- **mobile:** add push notification support ([6e53422](https://github.com/orro3790/drive/commit/6e534228a44e76dce3f5a13f7f8f993657f09ed2))

### Bug Fixes

- **auth:** allow scrolling on small viewports ([37ea868](https://github.com/orro3790/drive/commit/37ea868210d92d0cb748b2c4b4012b4c965f2a6e))
- **mobile:** improve mobile UI consistency and touch interactions ([e63d5d3](https://github.com/orro3790/drive/commit/e63d5d3d2448e9b7a045c103329b97588f82b1cd))
- **nightly:** fix witness-ui date alignment and no-show resilience ([d900f84](https://github.com/orro3790/drive/commit/d900f84efbe84853190be20f86172d94b9ae8623))
- **nightly:** fix witness-ui Windows compatibility and document agent-browser pitfalls ([0af3fda](https://github.com/orro3790/drive/commit/0af3fdaf617a56376fc77eb55cc11d727856b1d9))
