.PHONY: setup lint test

setup:
	uv venv
	uv pip install -r requirements.txt
	uv pip install tox tox-uv

lint:
	uv run ruff check backend

test:
	uv run pytest
