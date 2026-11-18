import unittest
from unittest.mock import Mock
from run import ROLES, supervise, verify


class RunnerTest(unittest.TestCase):
    def test_correlated_reply_and_single_post(self):
        ids = {r:r for r in ROLES}
        expected = "Simulation new complete. 12/20 crates committed (west 0, east 12). 8 outstanding."
        api = Mock(side_effect=[
            [{"id":r, "online":True} for r in ROLES], {"id":"new", "success":True},
            [{"sender_id":"west", "sender_type":"Agent", "content":expected},
             {"sender_id":"shelter", "sender_type":"Agent", "content":expected.replace("new","old")}],
            [{"sender_id":"shelter", "sender_type":"Agent", "content":"@owner " + expected}]])
        self.assertEqual(verify(api, ids, lambda:None, interval=0), expected)
        posts = [c for c in api.call_args_list if len(c.args) == 2]
        self.assertEqual(len(posts), 1)
        self.assertEqual(posts[0].args[1]["message"]["mentions"], [{"id":"shelter"}])

    def test_rest_readiness_uses_authenticated_children(self):
        ids = {r:r for r in ROLES}
        ready = Mock(side_effect=[False, True])
        expected = "Simulation run complete. 12/20 crates committed (west 0, east 12). 8 outstanding."
        request = Mock(side_effect=[{"success":True, "id":"run"},
                       [{"sender_id":"shelter", "sender_type":"Agent", "content":expected}]])
        self.assertEqual(verify(request, ids, lambda:None, ready=ready, interval=0), expected)
        self.assertEqual(request.call_args_list[0].args[0], "/messages")

    def test_per_peer_keys_and_cleanup_on_failed_verification(self):
        agents = {r:{"id":r, "key":"secret-" + r} for r in ROLES}
        children = [Mock() for r in ROLES]
        for child in children:
            child.poll.return_value = None
        launch = Mock(side_effect=children)
        with self.assertRaisesRegex(RuntimeError, "failed"):
            supervise({"agents":agents}, "/private", {}, Mock(side_effect=RuntimeError("failed")), launch)
        for role, child, call in zip(ROLES, children, launch.call_args_list):
            self.assertEqual([v for k,v in call.kwargs["env"].items() if k.endswith("API_KEY")], ["secret-" + role])
            child.terminate.assert_called_once()
            child.wait.assert_called_once()

if __name__ == "__main__":
    unittest.main()
