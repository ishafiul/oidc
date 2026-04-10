import 'package:flutter_test/flutter_test.dart';

import 'package:oidc_login_demo/main.dart';

void main() {
  testWidgets('shows app title', (WidgetTester tester) async {
    await tester.pumpWidget(const OidcLoginDemoApp());
    expect(find.text('OIDC login demo'), findsOneWidget);
  });
}
