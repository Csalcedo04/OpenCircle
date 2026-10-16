#!/usr/bin/env python3
"""Validador de calidad y formato para skills de Claude Code (.claude/skills).

Verifica:
- Existencia de SKILL.md
- Frontmatter YAML con 'name' y 'description'
- 'name' en minusculas/guiones (<= 64) y 'description' <= 1024 caracteres (limites de Claude Code)
- Presencia de directivas de cuándo usar y cuándo NO usar en la descripción
- Longitud de SKILL.md <= 200 lineas
- Scripts en scripts/ ejecutables con --help retornando exit 0
- Cero carpetas vacias
"""

import argparse
import os
import re
import subprocess
import sys


def parse_frontmatter(content):
    if not content.startswith("---"):
        return None, content

    parts = content.split("---", 2)
    if len(parts) < 3:
        return None, content

    fm_text = parts[1]
    body = parts[2]
    metadata = {}

    lines = fm_text.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        match = re.match(r"^([A-Za-z0-9_-]+):\s*(.*)$", line)
        if match:
            key = match.group(1).strip()
            val = match.group(2).strip()

            if val in (">-", ">", "|", "|-"):
                multiline_vals = []
                i += 1
                while i < len(lines) and (lines[i].startswith("  ") or not lines[i].strip()):
                    multiline_vals.append(lines[i].strip())
                    i += 1
                metadata[key] = " ".join([v for v in multiline_vals if v]).strip()
                continue
            else:
                if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
                    val = val[1:-1]
                metadata[key] = val
        i += 1

    return metadata, body


def validate_single_skill(skill_dir):
    problems = []
    skill_dir = os.path.abspath(skill_dir)
    skill_name = os.path.basename(skill_dir)

    skill_md = os.path.join(skill_dir, "SKILL.md")
    if not os.path.isfile(skill_md):
        return [f"Falta archivo requerido SKILL.md en {skill_dir}"]

    with open(skill_md, "r", encoding="utf-8") as f:
        content = f.read()

    lines = content.splitlines()
    if len(lines) > 200:
        problems.append(f"SKILL.md supera las 200 lineas ({len(lines)} lineas detectadas)")

    fm, _ = parse_frontmatter(content)
    if not fm:
        problems.append("SKILL.md no contiene un bloque YAML frontmatter valido delimitado por '---'")
    else:
        name_val = fm.get("name", "").strip()
        if not name_val:
            problems.append("Frontmatter no contiene el campo obligatorio 'name'")
        elif not re.fullmatch(r"[a-z0-9-]{1,64}", name_val):
            problems.append(f"'name' debe usar solo minusculas, digitos y guiones (max 64): {name_val}")
        elif name_val != skill_name:
            problems.append(f"'name' ({name_val}) no coincide con el nombre de la carpeta ({skill_name})")

        desc_val = fm.get("description", "").strip()
        if not desc_val:
            problems.append("Frontmatter no contiene el campo obligatorio 'description'")
        else:
            if len(desc_val) > 1024:
                problems.append(f"El campo 'description' supera los 1024 caracteres ({len(desc_val)} caracteres)")

            desc_lower = desc_val.lower()
            has_use = "usar" in desc_lower or "use" in desc_lower
            has_no_use = ("no usar" in desc_lower or "no use" in desc_lower or "evitar" in desc_lower or "no para" in desc_lower)
            if not (has_use and has_no_use):
                problems.append("La descripcion debe indicar explicitamente cuándo USAR y cuándo NO USAR la skill")

    # Validar que no existan carpetas vacias
    for root, dirs, files in os.walk(skill_dir):
        for d in dirs:
            dir_full = os.path.join(root, d)
            visible = [f for f in os.listdir(dir_full) if not f.startswith(".")]
            if len(visible) == 0:
                rel = os.path.relpath(dir_full, skill_dir)
                problems.append(f"Carpeta vacia detectada: {rel}/")

    # Validar scripts helpers si existen
    scripts_dir = os.path.join(skill_dir, "scripts")
    if os.path.isdir(scripts_dir):
        for s_file in os.listdir(scripts_dir):
            if s_file.startswith("."):
                continue
            s_full = os.path.join(scripts_dir, s_file)
            if os.path.isfile(s_full):
                # Probar --help
                cmd = [sys.executable, s_full, "--help"] if s_full.endswith(".py") else [s_full, "--help"]
                try:
                    res = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
                    if res.returncode != 0:
                        problems.append(f"Script {s_file} fallo ante '--help' con codigo {res.returncode}")
                except Exception as e:
                    problems.append(f"No se pudo ejecutar {s_file} con '--help': {e}")

    return problems


def main():
    parser = argparse.ArgumentParser(
        description="Validador de estandar y calidad para skills de Claude Code."
    )
    parser.add_argument(
        "target",
        nargs="?",
        default=".claude/skills",
        help="Ruta de la skill a validar (o directorio de skills).",
    )
    args = parser.parse_args()

    target_path = os.path.abspath(args.target)
    if not os.path.exists(target_path):
        print(f"ERROR: La ruta '{args.target}' no existe.")
        sys.exit(1)

    # Si se pasa un directorio contenedor de skills
    if os.path.isdir(target_path) and not os.path.isfile(os.path.join(target_path, "SKILL.md")):
        skill_dirs = [
            os.path.join(target_path, d)
            for d in os.listdir(target_path)
            if os.path.isdir(os.path.join(target_path, d)) and not d.startswith(".")
        ]
    else:
        skill_dirs = [target_path]

    total_problems = 0
    for s_dir in skill_dirs:
        s_name = os.path.basename(s_dir)
        problems = validate_single_skill(s_dir)
        if problems:
            total_problems += len(problems)
            print(f"FALLO: Problemas en skill '{s_name}':")
            for p in problems:
                print(f"  - {p}")
        else:
            print(f"OK: skill '{s_name}' válida y dentro de presupuesto")

    if total_problems > 0:
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    main()
