def get_valid_moves(board, color):
    # 置ける場所をリストで返す [(r, c), ...]
    moves = []
    for r in range(8):
        for c in range(8):
            if can_place(board, r, c, color):
                moves.append((r, c))
    return moves

def can_place(board, r, c, color):
    if board[r][c] != 0: return False
    opponent = 3 - color
    directions = [(-1,-1),(-1,0),(-1,1),(0,-1),(0,1),(1,-1),(1,0),(1,1)]
    for dr, dc in directions:
        if has_flippable(board, r, c, dr, dc, color, opponent):
            return True
    return False

def has_flippable(board, r, c, dr, dc, color, opponent):
    r += dr
    c += dc
    if not (0 <= r < 8 and 0 <= c < 8) or board[r][c] != opponent:
        return False
    while 0 <= r < 8 and 0 <= c < 8:
        if board[r][c] == 0: return False
        if board[r][c] == color: return True
        r += dr
        c += dc
    return False

def execute_move(board, r, c, color):
    board[r][c] = color
    opponent = 3 - color
    directions = [(-1,-1),(-1,0),(-1,1),(0,-1),(0,1),(1,-1),(1,0),(1,1)]
    for dr, dc in directions:
        if has_flippable(board, r, c, dr, dc, color, opponent):
            curr_r, curr_c = r + dr, c + dc
            while board[curr_r][curr_c] == opponent:
                board[curr_r][curr_c] = color
                curr_r += dr
                curr_c += dc
    return board
