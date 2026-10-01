import { Component, type ErrorInfo, type PropsWithChildren } from "react";
import { View, Text, Button } from "react-native";
import { reportError } from "../../utils/errors";
export class AppErrorBoundary extends Component<
  PropsWithChildren,
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, _info: ErrorInfo) {
    reportError("Application failed", error);
  }
  render() {
    if (this.state.failed)
      return (
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            padding: 24,
            gap: 16,
            backgroundColor: "#F5F6F8",
          }}
        >
          <Text style={{ fontSize: 22 }}>Unable to open Finance</Text>
          <Text>
            Your local data has not been deleted. Try again or restart the app.
          </Text>
          <Button
            title="Try again"
            onPress={() => this.setState({ failed: false })}
          />
        </View>
      );
    return this.props.children;
  }
}
