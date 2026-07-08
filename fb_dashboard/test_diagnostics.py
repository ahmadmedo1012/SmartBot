"""
Unit tests for DiagnosticsEngine.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from diagnostics import DiagnosticsEngine


def test_cycle_tracking():
    d = DiagnosticsEngine()
    assert d.get_cycle_stats()["count"] == 0
    d.record_cycle(100.0)
    d.record_cycle(200.0)
    d.record_cycle(300.0)
    stats = d.get_cycle_stats()
    assert stats["count"] == 3
    assert stats["avg_ms"] == 200.0
    assert stats["min_ms"] == 100.0
    assert stats["max_ms"] == 300.0
    assert stats["last_ms"] == 300.0
    print("✓ test_cycle_tracking")


def test_error_tracking():
    d = DiagnosticsEngine()
    d.record_api_error("/comments", 500, "Internal error")
    d.record_api_error("/posts", 403, "Forbidden")
    errors = d.get_recent_errors(10)
    assert len(errors) == 2
    assert errors[1]["endpoint"] == "/posts"
    assert errors[1]["status"] == 403
    d.record_cycle(100.0)
    assert d.get_error_rate() > 0
    print("✓ test_error_tracking")


def test_reset():
    d = DiagnosticsEngine()
    d.record_cycle(100.0)
    d.record_api_error("/test", 500, "err")
    d.reset()
    assert d.get_cycle_stats()["count"] == 0
    assert len(d.get_recent_errors()) == 0
    print("✓ test_reset")


def test_system_info():
    d = DiagnosticsEngine()
    info = d.get_system_info()
    assert "python" in info
    assert "platform" in info
    assert "pid" in info
    print("✓ test_system_info")


if __name__ == "__main__":
    test_cycle_tracking()
    test_error_tracking()
    test_reset()
    test_system_info()
    print("\n✅ All 4 diagnostics tests passed!")
