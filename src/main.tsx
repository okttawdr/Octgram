import { Component, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./modern.css";
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, _info: ErrorInfo) {
    console.error(error);
  }
  render() {
    return this.state.failed ? (
      <div className="setup">
        <h1>Octgram mengalami kendala.</h1>
        <p>Muat ulang halaman untuk mencoba kembali.</p>
        <button onClick={() => location.reload()}>Muat ulang</button>
      </div>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")!).render(
  <Boundary>
    <App />
  </Boundary>,
);
