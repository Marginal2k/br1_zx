; human_06: параметры и код задания дополнительного уровня 1999 г. (#79C0..#7E0F, 1104 байта; продолжение блока - герои, карта, экран)
; собирается sjasmplus (task.bin - из task.txt, см. tools/levels.py); подробности - docs/FORMATS.md

KBUILD	EQU	#7D00
LEVDAT	EQU	#79C0
	ORG	LEVDAT

isRUNL	DEFB	#C9	; #C9 - обычный уровень
hTOWER	DEFB	2	; макс. число типов вооружения (1-4)
hARC	DEFB	1
hHORSE	DEFB	0
hSHILD	DEFB	0
hBLADE	DEFB	0
hmaxC	DEFB	1	; число исследуемых заклинаний священника
hmaxW	DEFB	1	; то же волшебника
hmaxB1	DEFB	2	; макс. число стандартных зданий
hmaxB2	DEFB	2	; макс. число доп. зданий
hWALL	DEFB	0	; 0/17 - можно/нельзя строить стены
kTOWER	DEFB	2	; параметры компьютера
kARC	DEFB	0
kHORSE	DEFB	0
kSHILD	DEFB	0
kBLADE	DEFB	0
kmaxC	DEFB	1
kmaxW	DEFB	0
levMAX	DEFB	4	; макс. народу в группе врага
levDEL	DEFB	#43	; средняя задержка между сборами врага
lev1ST	DEFB	#C7	; начальная задержка первого сбора
levTYP	DEFB	0	; тип уровня (0 - обычный)
COLOR	DEFB	#32	; цвет поля
MASTER	DEFB	0	; кто играет: 0 люди, 1 кунги
LEVEL	DEFB	6	; номер уровня
MONEY	DEFB	0,0,0,3,5,0	; деньги (6 цифр)
WOOD	DEFB	0,0,0,4,0,0	; лес (6 цифр)
TASK_M	INCBIN	"task.bin"	; задание: 3 строки (см. task.txt)
LEVRES	DEFB	0,0,0,#2B,0,0,#7F	; текущее время прохождения
fsLAND	DEFB	1	; ландшафт 1-4
fsMUS	DEFB	4	; мелодия 0-7
SEL_T	DEFB	0
SEL_N	DEFB	0,0,0,0,0,0
sel_en	DEFB	#FF
sel_ti	DEFB	0
LED	DEFB	0,0,0,0,0,0
_msg	DEFB	0
pTX_AD	DEFW	#F0D7
TX_AD	DEFW	#F0D7
pTXdel	DEFB	0
isPLAT	DEFB	0
szPLAT	DEFB	0
bcPLAT	DEFW	#0000
adPLAT	DEFW	#0000
waPLAT	DEFB	0
onPAUS	DEFB	6
NOTA	DEFW	#7A4C
se	DEFW	#FFFF
levSND	DEFB	0
sIY56	DEFW	#0000
priv_S	DEFB	0
NOTA2	DEFW	#FF1D
priv_2	DEFB	5
pntX	DEFB	#30
pntY	DEFB	2
pntNUM	DEFB	#FF
pntDEL	DEFB	#C4
pntTAR	DEFB	6
pntUNI	DEFB	0
pntEN	DEFB	2,2,1,0,0,0
pntMAN	DEFB	0
END_1	DEFB	0	; 0/1/2 - нет/нет врагов/нет людей
END_2	DEFB	0
TheEND	DEFB	0	; 0/1/2 - нет/победа людей/победа врагов (ставит _cLOOP)
dummy	DEFB	0,0,0,0,0,0	; резерв

;------------ процедуры: pcLOOP - каждый кадр, pcINI - при старте ------------
pcLOOP:

        jr _cLOOP                     ; 7A6B  1801

pcINI:
        ret                           ; 7A6D  c9

_cLOOP:
        push ix                       ; 7A6E  dde5
        ld ix,KBUILD                  ; 7A70  dd21007d
        ld de,$0008                   ; 7A74  110800
        ld b,$20                      ; 7A77  0620
L_7A79:
        ld a,(ix+$02)                 ; 7A79  dd7e02
        cp $0c                        ; 7A7C  fe0c
        jr z,L_7A8D                   ; 7A7E  280d
L_7A80:
        add ix,de                     ; 7A80  dd19
        djnz L_7A79                   ; 7A82  10f5
        ld a,(END_1)                  ; 7A84  3a627a
L_7A87:
        ld (TheEND),a                 ; 7A87  32647a
        pop ix                        ; 7A8A  dde1
        ret                           ; 7A8C  c9

L_7A8D:
        ld a,(ix+$03)                 ; 7A8D  dd7e03
        or a                          ; 7A90  b7
        jr nz,L_7A80                  ; 7A91  20ed
        inc a                         ; 7A93  3c
        jr L_7A87                     ; 7A94  18f1

	DEFS	#7AA0-$,#27	; заполнитель до BULL (код задания - не более 53 байт: #7A6B..#7A9F)
	DEFS	#7E00-$	; рабочие массивы BULL, MINE, HBUILD, KBUILD, BUF512 (в файле нули)

datMIN	DEFW	13,76,280,65535,65535,65535,65535,65535	; золото 8 шахт (/100)
datHER		; здесь начинаются герои (496 байт), карта (4096) и экран (6912) - в файлах heroes.txt, map.csv, screen.png
