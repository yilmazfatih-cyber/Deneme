# Mini kabuk: make (derle) · make test (senaryo testleri) · make clean

CC      = gcc
CFLAGS  = -std=c11 -O2 -Wall -Wextra -Wpedantic -g
PYTHON  = python3

.PHONY: all test clean

all: kabuk

kabuk: kabuk.c
	$(CC) $(CFLAGS) -o $@ $<

test: kabuk
	PYTHONDONTWRITEBYTECODE=1 $(PYTHON) -m unittest discover -s tests -v

clean:
	rm -f kabuk
	rm -rf tests/__pycache__
