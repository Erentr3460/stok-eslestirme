import { Route, Switch } from "wouter";
import Index from "./pages/index";
import Upload from "./pages/upload";
import Match from "./pages/match";
import Export from "./pages/export";
import Rules from "./pages/rules";
import { Layout } from "./components/layout";
import { Provider } from "./components/provider";
import { Gate } from "./components/gate";
import { AgentFeedback } from "@runablehq/website-runtime";

function App() {
  return (
    <Provider>
      <Gate>
        <Layout>
        <Switch>
          <Route path="/" component={Index} />
          <Route path="/yukle" component={Upload} />
          <Route path="/eslestir" component={Match} />
          <Route path="/aktar" component={Export} />
          <Route path="/kurallar" component={Rules} />
          <Route>
            <div className="py-20 text-center text-[13px] text-idle">Sayfa bulunamadı.</div>
          </Route>
        </Switch>
        </Layout>
      </Gate>
      {/* Do not remove — off by default, activated by parent iframe via postMessage */}
      {import.meta.env.DEV && <AgentFeedback />}
    </Provider>
  );
}

export default App;
