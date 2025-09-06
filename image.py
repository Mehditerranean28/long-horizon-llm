#!/usr/bin/env python3
"""
src/scripts/image.py

Removes “empty” layers from a Docker-tar image (where a layer's tar file consists entirely of zero bytes).
Usage:
    python src/scripts/image.py <input_image.tar> -o <output_image.tar>

This script:
  • Extracts the input .tar into a temporary folder.
  • Scans each layer's “layer.tar” for nonzero bytes (streaming in chunks).
  • Edits manifest.json and the config JSON to remove any truly empty layers.
  • Repackages the result into a new .tar at the given output path.
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
from tempfile import mkdtemp
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1] / "backend"))

from backend.src.utils.common import setup_console_logger

# Set up a dedicated logger
logger = setup_console_logger("image_cleaner")


def is_layer_empty(layer_path: str) -> bool:
    """
    Reads the given layer tar file in 64 KB chunks.
    Returns True if every byte is zero (i.e., effectively an empty layer),
    False as soon as any nonzero byte is found.
    """
    try:
        with open(layer_path, "rb") as f:
            while True:
                chunk = f.read(64 * 1024)
                if not chunk:
                    return True  # EOF reached, no nonzero byte found
                # If any byte != 0, it's not empty
                if any(b for b in chunk):
                    return False
    except OSError as e:
        logger.error(
            f"Failed to read layer file '{layer_path}': {e}",
            exc_info=True,
        )
        raise


def clean_image(args: argparse.Namespace):
    """
    Extracts the input Docker .tar, removes truly empty layers, adjusts manifest+config JSON,
    and repackages a cleaned tar at args.output.
    """
    input_tar = os.path.abspath(args.image)
    output_tar = os.path.abspath(args.output)

    # Validate input and output paths
    if not input_tar.endswith(".tar") or not os.path.isfile(input_tar):
        logger.error(f"Input '{input_tar}' is not a valid .tar file.")
        sys.exit(1)
    if os.path.exists(output_tar):
        logger.error(
            f"Output file '{output_tar}' already exists. Please remove or specify a different name."
        )
        sys.exit(1)

    # Create a temporary directory to extract the tar
    temp_dir = mkdtemp(prefix="image_clean_")
    logger.info(f"Created temporary directory: {temp_dir}")

    try:
        # 1. Extract input tar into temp_dir
        logger.info(f"Extracting '{input_tar}' into '{temp_dir}'...")
        subprocess.check_call(["tar", "-xf", input_tar, "-C", temp_dir])

        # 2. Parse manifest.json
        manifest_path = os.path.join(temp_dir, "manifest.json")
        try:
            with open(manifest_path, encoding="utf-8") as mf:
                manifest_list = json.load(mf)
                if not isinstance(manifest_list, list) or len(manifest_list) == 0:
                    logger.error("Manifest JSON is empty or malformed.")
                    sys.exit(1)
                manifest_json = manifest_list[0]
        except (json.JSONDecodeError, IndexError) as e:
            logger.error(f"Failed to read or parse '{manifest_path}': {e}")
            sys.exit(1)

        conf_name = manifest_json.get("Config")
        layers = manifest_json.get("Layers", [])
        if not conf_name or not layers:
            logger.error(
                "Manifest JSON does not contain 'Config' or 'Layers'. Aborting."
            )
            sys.exit(1)

        # 3. Load config JSON
        conf_path = os.path.join(temp_dir, conf_name)
        try:
            with open(conf_path, encoding="utf-8") as cf:
                conf_json = json.load(cf)
        except (json.JSONDecodeError, FileNotFoundError) as e:
            logger.error(f"Failed to read or parse '{conf_path}': {e}")
            sys.exit(1)

        # The “history” array in the config JSON corresponds one-to-one with layers in manifest
        all_history = conf_json.get("history", [])
        diff_ids = conf_json.get("rootfs", {}).get("diff_ids", [])
        if len(all_history) != len(diff_ids):
            logger.warning(
                "Config JSON 'history' length does not match 'rootfs.diff_ids'. Proceeding carefully."
            )

        # Map each layer filename to the index in history/diff_ids
        # We'll remove entries whose layer.tar is empty.
        layers_to_remove = []
        logger.info("Scanning layers for emptiness...")
        for idx, layer_filename in enumerate(layers):
            layer_tar_path = os.path.join(temp_dir, layer_filename)
            if not os.path.isfile(layer_tar_path):
                logger.warning(
                    f"Layer file '{layer_tar_path}' does not exist; skipping emptiness check."
                )
                continue

            if is_layer_empty(layer_tar_path):
                logger.info(
                    f"Layer '{layer_filename}' is empty (all zero bytes). Marking for removal."
                )
                layers_to_remove.append((idx, layer_filename))

        if not layers_to_remove:
            logger.info("No empty layers found. Copying original image to output.")
            shutil.copy(input_tar, output_tar)
            logger.info(f"Output saved to '{output_tar}'.")
            return

        # 4. Remove empty layers from manifest JSON and config JSON
        # We must adjust indexes in reverse order so that earlier removals don't shift indices incorrectly.
        layers_removed_count = 0
        for idx, layer_filename in sorted(
            layers_to_remove, key=lambda x: x[0], reverse=True
        ):
            # Remove from manifest['Layers']
            removed = manifest_json["Layers"].pop(idx)
            logger.debug(f"Removed '{removed}' from manifest.")

            # Remove from config JSON: pop history at idx and remove corresponding diff_id
            try:
                removed_history = all_history.pop(idx)
                removed_diff_id = diff_ids.pop(idx)
                logger.debug(
                    f"Removed history entry '{removed_history}' and diff_id '{removed_diff_id}' at index {idx}."
                )
            except IndexError:
                logger.warning(
                    f"Index {idx} out of range for history/diff_ids while removing layer '{layer_filename}'."
                )

            # Also delete the extracted folder for that layer (often something like "<sha256>/layer.tar")
            layer_dir = os.path.join(temp_dir, layer_filename.replace("/layer.tar", ""))
            if os.path.isdir(layer_dir):
                shutil.rmtree(layer_dir)
                logger.debug(f"Deleted extracted folder '{layer_dir}'.")
            layers_removed_count += 1

        # 5. Write updated manifest.json and config JSON back to disk
        logger.info(f"Writing {layers_removed_count} updated JSONs back to disk...")
        with open(manifest_path, "w", encoding="utf-8") as mf:
            json.dump([manifest_json], mf, indent=2)
        with open(conf_path, "w", encoding="utf-8") as cf:
            json.dump(conf_json, cf, indent=2)

        # 6. Re-tar contents of temp_dir into output_tar
        logger.info(f"Repacking cleaned image to '{output_tar}'...")
        cwd = os.getcwd()
        os.chdir(temp_dir)
        try:
            subprocess.check_call(["tar", "-cf", output_tar, *os.listdir()])
        finally:
            os.chdir(cwd)

        if not os.path.isfile(output_tar):
            logger.error(
                f"Expected to find '{output_tar}' after tar operation, but it was not created."
            )
            sys.exit(1)

        logger.info(f"Successfully created cleaned image: '{output_tar}'.")
    except subprocess.CalledProcessError as e:
        logger.error(f"Shell command failed: {e}")
        sys.exit(1)
    finally:
        # Cleanup temp directory
        if os.path.isdir(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)
            logger.info(f"Cleaned up temporary directory: {temp_dir}")


def main():
    parser = argparse.ArgumentParser(
        description="Remove empty layers from a Docker .tar image."
    )
    parser.add_argument(
        "image",
        help="Path to the input Docker .tar image (e.g., myapp.tar).",
    )
    parser.add_argument(
        "-o",
        "--output",
        required=True,
        help="Path to write the cleaned output .tar image.",
    )
    args = parser.parse_args()
    clean_image(args)


if __name__ == "__main__":
    main()
