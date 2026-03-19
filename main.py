#!/usr/bin/env python3
"""Super Board Game Game - A comprehensive collection of classic board games."""

import os
import sys
import json
import signal

from engine.menu import MainMenu


def clear_screen():
    os.system('cls' if os.name == 'nt' else 'clear')


def main():
    clear_screen()
    menu = MainMenu()
    menu.run()


if __name__ == '__main__':
    main()
