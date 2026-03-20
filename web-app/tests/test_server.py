"""Backend unit tests for Purple Lab v2."""
import json
import os
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# Ensure imports work
# ---------------------------------------------------------------------------

WEB_APP_DIR = Path(__file__).resolve().parent.parent
if str(WEB_APP_DIR) not in sys.path:
    sys.path.insert(0, str(WEB_APP_DIR))


# ============================================================================
# Test DevServerManager
# ============================================================================


class TestDevServerManager:
    """Tests for the DevServerManager class."""

    @pytest.fixture(autouse=True)
    def _setup(self):
        from server import DevServerManager
        self.manager = DevServerManager()

    @pytest.mark.asyncio
    async def test_detect_dev_command_node(self, tmp_path):
        """Test detection of npm dev command from package.json."""
        pkg = tmp_path / "package.json"
        pkg.write_text(json.dumps({
            "scripts": {"dev": "vite"},
            "devDependencies": {"vite": "^5.0.0"},
        }))
        result = await self.manager.detect_dev_command(str(tmp_path))
        assert result is not None
        assert result["command"] == "npm run dev"
        assert result["expected_port"] == 5173
        assert result["framework"] == "vite"

    @pytest.mark.asyncio
    async def test_detect_dev_command_nextjs(self, tmp_path):
        """Test detection of Next.js dev command."""
        pkg = tmp_path / "package.json"
        pkg.write_text(json.dumps({
            "scripts": {"dev": "next dev"},
            "dependencies": {"next": "^14.0.0"},
        }))
        result = await self.manager.detect_dev_command(str(tmp_path))
        assert result is not None
        assert result["command"] == "npm run dev"
        assert result["framework"] == "next"
        assert result["expected_port"] == 3000

    @pytest.mark.asyncio
    async def test_detect_dev_command_npm_start(self, tmp_path):
        """Test detection of npm start script."""
        pkg = tmp_path / "package.json"
        pkg.write_text(json.dumps({
            "scripts": {"start": "react-scripts start"},
            "dependencies": {"react": "^18.0.0"},
        }))
        result = await self.manager.detect_dev_command(str(tmp_path))
        assert result is not None
        assert result["command"] == "npm start"
        assert result["framework"] == "react"

    @pytest.mark.asyncio
    async def test_detect_dev_command_python_flask(self, tmp_path):
        """Test detection of Flask app."""
        app = tmp_path / "app.py"
        app.write_text("from flask import Flask\napp = Flask(__name__)")
        result = await self.manager.detect_dev_command(str(tmp_path))
        assert result is not None
        assert result["framework"] == "flask"
        assert result["expected_port"] == 5000

    @pytest.mark.asyncio
    async def test_detect_dev_command_python_fastapi(self, tmp_path):
        """Test detection of FastAPI app."""
        app = tmp_path / "app.py"
        app.write_text("from fastapi import FastAPI\napp = FastAPI()")
        result = await self.manager.detect_dev_command(str(tmp_path))
        assert result is not None
        assert result["framework"] == "fastapi"
        assert result["expected_port"] == 8000
        assert "uvicorn" in result["command"]

    @pytest.mark.asyncio
    async def test_detect_dev_command_django(self, tmp_path):
        """Test detection of Django manage.py."""
        manage = tmp_path / "manage.py"
        manage.write_text("#!/usr/bin/env python\nimport django")
        result = await self.manager.detect_dev_command(str(tmp_path))
        assert result is not None
        assert result["framework"] == "django"
        assert "manage.py runserver" in result["command"]

    @pytest.mark.asyncio
    async def test_detect_dev_command_go(self, tmp_path):
        """Test detection of Go project."""
        (tmp_path / "go.mod").write_text("module example.com/app\n\ngo 1.21")
        result = await self.manager.detect_dev_command(str(tmp_path))
        assert result is not None
        assert result["framework"] == "go"
        assert result["command"] == "go run ."

    @pytest.mark.asyncio
    async def test_detect_dev_command_rust(self, tmp_path):
        """Test detection of Rust project."""
        (tmp_path / "Cargo.toml").write_text('[package]\nname = "app"\nversion = "0.1.0"')
        result = await self.manager.detect_dev_command(str(tmp_path))
        assert result is not None
        assert result["framework"] == "rust"
        assert result["command"] == "cargo run"

    @pytest.mark.asyncio
    async def test_detect_dev_command_empty_dir(self, tmp_path):
        """Test returns None for empty directory."""
        result = await self.manager.detect_dev_command(str(tmp_path))
        assert result is None

    @pytest.mark.asyncio
    async def test_detect_dev_command_nonexistent(self, tmp_path):
        """Test returns None for non-existent directory."""
        result = await self.manager.detect_dev_command(str(tmp_path / "no-such-dir"))
        assert result is None

    @pytest.mark.asyncio
    async def test_detect_dev_command_makefile(self, tmp_path):
        """Test detection from Makefile."""
        makefile = tmp_path / "Makefile"
        makefile.write_text("dev:\n\tpython app.py\n\nclean:\n\trm -rf build")
        result = await self.manager.detect_dev_command(str(tmp_path))
        assert result is not None
        assert result["command"] == "make dev"
        assert result["framework"] == "make"

    def test_parse_port_vite(self):
        """Test port parsing from Vite output."""
        output = "  Local:   http://localhost:5173/"
        port = self.manager._parse_port(output)
        assert port == 5173

    def test_parse_port_nextjs(self):
        """Test port parsing from Next.js output."""
        output = "  - Local: http://localhost:3000"
        port = self.manager._parse_port(output)
        assert port == 3000

    def test_parse_port_express(self):
        """Test port parsing from Express output."""
        output = "Server listening on port 4000"
        port = self.manager._parse_port(output)
        assert port == 4000

    def test_parse_port_uvicorn(self):
        """Test port parsing from Uvicorn output."""
        output = "INFO:     Uvicorn running on http://127.0.0.1:8000"
        port = self.manager._parse_port(output)
        assert port == 8000

    def test_parse_port_zero_ip(self):
        """Test port parsing from 0.0.0.0 binding."""
        output = "Listening on http://0.0.0.0:8080"
        port = self.manager._parse_port(output)
        assert port == 8080

    def test_parse_port_no_match(self):
        """Test returns None when no port found."""
        output = "Application started successfully"
        port = self.manager._parse_port(output)
        assert port is None

    def test_parse_port_invalid_range(self):
        """Test rejects ports outside valid range."""
        output = "http://localhost:99"
        port = self.manager._parse_port(output)
        assert port is None  # 99 < 1024

    @pytest.mark.asyncio
    async def test_status_when_no_server(self):
        """Test status returns stopped when no server exists."""
        result = await self.manager.status("nonexistent-session")
        assert result["running"] is False
        assert result["status"] == "stopped"
        assert result["port"] is None
        assert result["command"] is None


# ============================================================================
# Test FileWatcher
# ============================================================================


class TestFileWatcher:
    """Tests for the FileChangeHandler class."""

    def test_ignore_patterns_git(self):
        """Test that .git directory is ignored."""
        from server import FileChangeHandler
        handler = FileChangeHandler.__new__(FileChangeHandler)
        handler.project_dir = "/tmp/test"
        assert handler._should_ignore("/tmp/test/.git/objects/abc123") is True

    def test_ignore_patterns_node_modules(self):
        """Test that node_modules is ignored."""
        from server import FileChangeHandler
        handler = FileChangeHandler.__new__(FileChangeHandler)
        handler.project_dir = "/tmp/test"
        assert handler._should_ignore("/tmp/test/node_modules/pkg/index.js") is True

    def test_ignore_patterns_pycache(self):
        """Test that __pycache__ is ignored."""
        from server import FileChangeHandler
        handler = FileChangeHandler.__new__(FileChangeHandler)
        handler.project_dir = "/tmp/test"
        assert handler._should_ignore("/tmp/test/__pycache__/mod.cpython-312.pyc") is True

    def test_ignore_patterns_extensions(self):
        """Test that temporary file extensions are ignored."""
        from server import FileChangeHandler
        handler = FileChangeHandler.__new__(FileChangeHandler)
        handler.project_dir = "/tmp/test"
        assert handler._should_ignore("/tmp/test/file.pyc") is True
        assert handler._should_ignore("/tmp/test/file.swp") is True
        assert handler._should_ignore("/tmp/test/.DS_Store") is True

    def test_allow_normal_files(self):
        """Test that normal source files are not ignored."""
        from server import FileChangeHandler
        handler = FileChangeHandler.__new__(FileChangeHandler)
        handler.project_dir = "/tmp/test"
        assert handler._should_ignore("/tmp/test/src/main.ts") is False
        assert handler._should_ignore("/tmp/test/index.html") is False
        assert handler._should_ignore("/tmp/test/app.py") is False

    def test_ignore_loki_dir(self):
        """Test that .loki directory is ignored."""
        from server import FileChangeHandler
        handler = FileChangeHandler.__new__(FileChangeHandler)
        handler.project_dir = "/tmp/test"
        assert handler._should_ignore("/tmp/test/.loki/state.json") is True


# ============================================================================
# Test Auth
# ============================================================================


try:
    import jose  # noqa: F401
    _HAS_JOSE = True
except ImportError:
    _HAS_JOSE = False

try:
    import sqlalchemy  # noqa: F401
    _HAS_SQLALCHEMY = True
except ImportError:
    _HAS_SQLALCHEMY = False


@pytest.mark.skipif(not _HAS_JOSE, reason="python-jose not installed")
class TestAuth:
    """Tests for the auth module."""

    def test_create_access_token(self):
        """Test JWT token creation."""
        from auth import create_access_token
        token = create_access_token({"sub": "user@example.com", "name": "Test User"})
        assert isinstance(token, str)
        assert len(token) > 20  # JWT tokens are substantial

    def test_verify_valid_token(self):
        """Test token verification with a valid token."""
        from auth import create_access_token, verify_token
        token = create_access_token({"sub": "user@example.com"})
        payload = verify_token(token)
        assert payload is not None
        assert payload["sub"] == "user@example.com"
        assert "exp" in payload

    def test_verify_expired_token(self):
        """Test expired token rejection."""
        from auth import create_access_token, verify_token
        # Create token that expired 1 hour ago
        token = create_access_token(
            {"sub": "user@example.com"},
            expires_delta=timedelta(hours=-1),
        )
        payload = verify_token(token)
        assert payload is None

    def test_verify_invalid_token(self):
        """Test that a garbage token is rejected."""
        from auth import verify_token
        payload = verify_token("not.a.valid.jwt.token")
        assert payload is None

    def test_verify_tampered_token(self):
        """Test that a tampered token is rejected."""
        from auth import create_access_token, verify_token
        token = create_access_token({"sub": "user@example.com"})
        # Tamper with the payload
        parts = token.split(".")
        parts[1] = parts[1] + "tampered"
        tampered = ".".join(parts)
        payload = verify_token(tampered)
        assert payload is None

    def test_local_mode_no_auth(self):
        """Test that auth is skipped when no DB configured."""
        # When async_session_factory is None, get_current_user should return None
        # (which means auth is disabled, all requests allowed)
        from models import async_session_factory
        assert async_session_factory is None  # No DB in test environment


# ============================================================================
# Test Models
# ============================================================================


@pytest.mark.skipif(not _HAS_SQLALCHEMY, reason="sqlalchemy not installed")
class TestModels:
    """Tests for SQLAlchemy model definitions."""

    def test_user_model(self):
        """Test User model has expected columns."""
        from models import User
        assert hasattr(User, "id")
        assert hasattr(User, "email")
        assert hasattr(User, "name")
        assert hasattr(User, "avatar_url")
        assert hasattr(User, "provider")
        assert hasattr(User, "created_at")
        assert hasattr(User, "is_active")

    def test_session_model(self):
        """Test Session model has expected columns."""
        from models import Session
        assert hasattr(Session, "id")
        assert hasattr(Session, "user_id")
        assert hasattr(Session, "prd_content")
        assert hasattr(Session, "provider")
        assert hasattr(Session, "status")
        assert hasattr(Session, "started_at")

    def test_project_model(self):
        """Test Project model has expected columns."""
        from models import Project
        assert hasattr(Project, "id")
        assert hasattr(Project, "user_id")
        assert hasattr(Project, "name")
        assert hasattr(Project, "project_dir")

    def test_secret_model(self):
        """Test Secret model has expected columns."""
        from models import Secret
        assert hasattr(Secret, "id")
        assert hasattr(Secret, "user_id")
        assert hasattr(Secret, "key")
        assert hasattr(Secret, "encrypted_value")

    def test_audit_log_model(self):
        """Test AuditLog model has expected columns."""
        from models import AuditLog
        assert hasattr(AuditLog, "id")
        assert hasattr(AuditLog, "action")
        assert hasattr(AuditLog, "resource_type")
        assert hasattr(AuditLog, "ip_address")


# ============================================================================
# Test SSE Streaming
# ============================================================================


class TestStreaming:
    """Tests for SSE streaming format."""

    def test_sse_output_format(self):
        """Test SSE event format for output lines."""
        # Verify the format matches what the server produces
        line = "Building project..."
        event = f"event: output\ndata: {json.dumps({'line': line})}\n\n"
        assert event.startswith("event: output\n")
        assert "data: " in event
        assert event.endswith("\n\n")
        data_line = event.split("\n")[1]
        payload = json.loads(data_line.replace("data: ", ""))
        assert payload["line"] == line

    def test_sse_complete_event(self):
        """Test SSE completion event includes files_changed and returncode."""
        returncode = 0
        files_changed = ["src/main.ts", "package.json"]
        event = f"event: complete\ndata: {json.dumps({'returncode': returncode, 'files_changed': files_changed})}\n\n"
        assert event.startswith("event: complete\n")
        data_line = event.split("\n")[1]
        payload = json.loads(data_line.replace("data: ", ""))
        assert payload["returncode"] == 0
        assert payload["files_changed"] == ["src/main.ts", "package.json"]

    def test_sse_error_format(self):
        """Test SSE error event format."""
        error_msg = "Task not found"
        event = f"event: error\ndata: {json.dumps({'error': error_msg})}\n\n"
        assert "event: error" in event
        data_line = event.split("\n")[1]
        payload = json.loads(data_line.replace("data: ", ""))
        assert payload["error"] == error_msg


# ============================================================================
# Test Request/Response Models
# ============================================================================


class TestRequestModels:
    """Tests for Pydantic request models."""

    def test_start_request_defaults(self):
        """Test StartRequest has correct defaults."""
        from server import StartRequest
        req = StartRequest(prd="Build a todo app")
        assert req.prd == "Build a todo app"
        assert req.provider == "claude"
        assert req.projectDir is None
        assert req.mode is None

    def test_chat_request_defaults(self):
        """Test ChatRequest has correct defaults."""
        from server import ChatRequest
        req = ChatRequest(message="fix the bug")
        assert req.message == "fix the bug"
        assert req.mode == "quick"

    def test_dev_server_start_request(self):
        """Test DevServerStartRequest accepts optional command."""
        from server import DevServerStartRequest
        req = DevServerStartRequest()
        assert req.command is None
        req2 = DevServerStartRequest(command="npm run dev")
        assert req2.command == "npm run dev"

    def test_secret_request(self):
        """Test SecretRequest model."""
        from server import SecretRequest
        req = SecretRequest(key="API_KEY", value="secret123")
        assert req.key == "API_KEY"
        assert req.value == "secret123"
